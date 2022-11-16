const diff = require("fast-diff");

const POSSIBLE_CURSORS = String.fromCharCode(
  0xfffd,
  0xffff,
  0x1f094,
  0x1f08d,
  0xe004,
  0x1f08d
).split("");

class Formatter {
  //
  // Construct.
  //
  constructor() {
    this.format = this.format.bind(this);
    this.replace = this.replace.bind(this);
    this.diff = this.diff.bind(this);
    this.applyDiff = this.applyDiff.bind(this);
  }

  //
  // get the process we are going to run.
  //
  async getProcess(filePath) {
    const executablePath = nova.extension.path + "/Vendor/goimports";

    var options = [filePath];

    // options.unshift("-format-only");

    return new Process(executablePath, {
      args: Array.from(new Set(options)),
      cwd: nova.workspace.path,
    });
  }

  diff(original, formatted, selectedRanges) {
    // Find a cursor that does not occur in this document
    const cursor = POSSIBLE_CURSORS.find(
      (cursor) => !original.includes(cursor) && !formatted.includes(cursor)
    );
    // Fall back to not knowing the cursor position.
    if (!cursor) return null;

    let originalWithCursors = "";
    let lastEnd = 0;

    for (const selection of selectedRanges) {
      originalWithCursors +=
        original.slice(lastEnd, selection.start) +
        cursor +
        original.slice(selection.start, selection.end) +
        cursor;
      lastEnd = selection.end;
    }

    originalWithCursors += original.slice(lastEnd);

    // Diff
    return [cursor, diff(originalWithCursors, formatted)];
  }

  async applyDiff(editor, cursor, edits) {
    const selections = [];
    await editor.edit((e) => {
      let offset = 0;
      let toRemove = 0;

      // Add an extra empty edit so any trailing delete is actually run.
      edits.push([diff.EQUAL, ""]);

      for (const [edit, str] of edits) {
        if (edit === diff.DELETE) {
          toRemove += str.length;

          // Check if the cursors are in here
          let cursorIndex = -1;
          while (true) {
            cursorIndex = str.indexOf(cursor, cursorIndex + 1);
            if (cursorIndex === -1) break;

            const lastSelection = selections[selections.length - 1];
            if (!lastSelection || lastSelection[1]) {
              selections[selections.length] = [offset];
            } else {
              lastSelection[1] = offset;
            }
            toRemove -= cursor.length;
          }

          continue;
        }

        if (edit === diff.EQUAL && toRemove) {
          e.replace(new Range(offset, offset + toRemove), "");
        } else if (edit === diff.INSERT) {
          e.replace(new Range(offset, offset + toRemove), str);
        }

        toRemove = 0;
        offset += str.length;
      }
    });

    editor.selectedRanges = selections.map((s) => new Range(s[0], s[1]));
    editor.save();
  }

  async replace(editor, formatted) {
    const { document } = editor;
    const cursorPosition = editor.selectedRange.end;
    const documentRange = new Range(0, document.length);

    await editor.edit((e) => {
      e.replace(documentRange, formatted);
    });
    editor.selectedRanges = [new Range(cursorPosition, cursorPosition)];
    editor.save();
  }

  //
  // Format the document via goimports
  //
  async format(editor) {
    const { document } = editor;
    // Document can't be empty
    if (document.isEmpty) {
      return;
    }

    const documentRange = new Range(0, document.length);
    const original = editor.getTextInRange(documentRange);
    const filePath = nova.workspace.relativizePath(document.path);

    let formatted = await new Promise(async (resolve) => {
      let outBuffer = [];
      let errBuffer = [];
      const process = await this.getProcess(filePath);

      if (!process) {
        return;
      }
      // Setup process events
      process.onStdout((output) => outBuffer.push(output));
      process.onStderr((error) => errBuffer.push(error));
      process.onDidExit((status) => {
        if (status === 0) {
          const formattedContent = outBuffer.join("");
          resolve(formattedContent);
        } else {
          console.error(errBuffer.join(""));
        }
      });
      // Run the process.
      console.log("Running " + process.command + " " + process.args.join(" "));
      process.start();
    });

    const [cursor, edits] = this.diff(
      original,
      formatted,
      editor.selectedRanges
    );

    if (
      original !== editor.getTextInRange(new Range(0, editor.document.length))
    ) {
      console.info(
        `Document ${editor.document.path} was changed while formatting`
      );
      return;
    }

    if (edits) {
      return this.applyDiff(editor, cursor, edits);
    }

    return this.replace(editor, formatted);
  }
}

module.exports = {
  Formatter,
};
