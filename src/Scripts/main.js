const lsp = require("./lsp.js");
const { Formatter } = require("./formatter.js");
const {
  showError,
  getConfigWithWorkspaceOverride,
  observeConfigWithWorkspaceOverride,
  observeConfigDidChange,
} = require("./helpers.js");

class GoExtension {
  constructor() {
    this.didAddTextEditor = this.didAddTextEditor.bind(this);
    this.toggleFormatOnSave = this.toggleFormatOnSave.bind(this);
    this.editorDidSave = this.editorDidSave.bind(this);
    this.didInvokeFormatCommand = this.didInvokeFormatCommand.bind(this);
    this.startLanguageClient = this.startLanguageClient.bind(this);
    this.jumpToDefinition = this.jumpToDefinition.bind(this);

    this.saveListeners = new Map();
    this.formatter = new Formatter();
    this.client = undefined;
  }

  setupConfiguration() {
    observeConfigWithWorkspaceOverride(
      "go.format-on-save",
      this.toggleFormatOnSave
    );
    observeConfigDidChange("go.enable-gopls", this.startLanguageClient);
  }

  registerCommand() {
    this.formatCommand = nova.commands.register(
      "go.format",
      this.didInvokeFormatCommand
    );
    this.jumpCommand = nova.commands.register(
      "go.jumpToDefinition",
      this.jumpToDefinition
    );
  }

  start() {
    this.setupConfiguration();
    this.startLanguageClient();
    nova.workspace.onDidAddTextEditor(this.didAddTextEditor);
    this.registerCommand();
  }

  stop() {
    if (this.client) {
      try {
        if (this.jumpCommand) {
          this.jumpCommand.dispose();
        }
        if (this.formatCommand) {
          this.formatCommand.dispose();
        }
      } catch (err) {
        console.error(
          "While stopping, disposing the editor commands failed: ",
          err
        );
      }
      try {
        this.client.stop();
        nova.subscriptions.remove(this.client);
        this.client = undefined;
      } catch (err) {
        console.error(
          "Could not stop languageClient and/or remove it from subscriptions: ",
          err
        );
      }
    } else {
      console.error("language server not running.");
    }
  }

  toggleFormatOnSave() {
    this.enabled = getConfigWithWorkspaceOverride("go.format-on-save");

    if (this.enabled) {
      nova.workspace.textEditors.forEach(this.didAddTextEditor);
    } else {
      this.saveListeners.forEach((listener) => listener.dispose());
      this.saveListeners.clear();
    }
  }

  didAddTextEditor(editor) {
    if (!this.enabled) return;

    if (this.saveListeners.has(editor)) return;
    this.saveListeners.set(editor, editor.onDidSave(this.editorDidSave));
  }

  // goimports need format after save, so any way else?
  // need save twice now.
  // format() => editor.save()
  async editorDidSave(editor) {
    await this.formatter.format(editor);
  }
  async didInvokeFormatCommand(editor) {
    await this.formatter.format(editor);
  }

  startLanguageClient() {
    if (this.client) {
      this.stop();
    }

    this.useGopls = getConfigWithWorkspaceOverride("go.enable-gopls");
    if (this.useGopls) {
      let serverOptions = {
        path: "/usr/local/bin/gopls",
        args: ["serve"],
      };

      let clientOptions = {
        syntaxes: ["go"],
        initializationOptions: {
          hoverKind: "SynopsisDocumentation",
          usePlaceHolders: true,
        },
      };
      this.client = new LanguageClient(
        "gopls",
        "Go Language Server",
        serverOptions,
        clientOptions
      );

      try {
        this.client.start();
        nova.subscriptions.add(this.client);
      } catch (err) {
        console.error(
          "Couldn't start the gopls server; please check path. Error was: ",
          err
        );
      }
    } else {
      console.info("disable gopls");
    }
  }

  jumpToDefinition(editor) {
    if (this.client == undefined) {
      showError(
        "go-jump-error",
        "Unable to jump",
        "jumpToDefinition() called, but gopls language server is not running"
      );
      return;
    }
    let selectedRange = editor.selectedRange;
    let selectedPosition, _a;
    selectedPosition =
      (_a = lsp.RangeToLspRange(editor.document, selectedRange)) === null ||
      _a === void 0
        ? void 0
        : _a.start;
    if (!selectedPosition) {
      nova.workspace.showWarningMessage(
        "Couldn't figure out what you've selected."
      );
      return;
    }
    let params = {
      textDocument: {
        uri: editor.document.uri,
      },
      position: selectedPosition,
    };
    let jump = this.client.sendRequest("textDocument/definition", params);

    jump.then(function (to) {
      if (to !== null) {
        if (to.length > 0) {
          var target = to[0];
          console.info("Jumping", JSON.stringify(to[0]));
          nova.workspace
            .openFile(target.uri)
            .then(function (targetEditor) {
              if (targetEditor === undefined) {
                console.error("Failed to get TextEditor, will retry");
                nova.workspace
                  .openFile(target.uri)
                  .then(function (targetEditor) {
                    targetEditor.selectedRange = lsp.LspRangeToRange(
                      targetEditor.document,
                      target.range
                    );
                    targetEditor.scrollToCursorPosition();
                  })
                  .catch(function (err) {
                    console.error(
                      "Failed to get text editor on the second try",
                      err
                    );
                  });
              } else {
                targetEditor.selectedRange = lsp.LspRangeToRange(
                  targetEditor.document,
                  target.range
                );
                targetEditor.scrollToCursorPosition();
              }
            })
            .catch(function (err) {
              console.info("Failed in the jump", err);
            });
        }
      }
    });
  }
}

exports.activate = async function () {
  try {
    const extension = new GoExtension();
    extension.start();
  } catch (err) {
    console.error("Unable to set up go service", err, err.stack);

    return showError(
      "go-resolution-error",
      `Unable to start go`,
      `Please check the extension console for additional logs.`
    );
  }
};

exports.deactivate = function () {
  // Clean up state before the extension is deactivated
};
