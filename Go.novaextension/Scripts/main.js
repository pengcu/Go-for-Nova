'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var main = {};

var lsp$1 = {};

(function (exports) {
	// Turn a Nova start-end range to an LSP row-column range.
	// From https://github.com/apexskier/nova-typescript
	//
	// Adding the original license terms from Microsoft, as shown on @apexskier's
	//  own files (gwyneth 20200130)
	// Probably this is the [Microsoft Public License (MS-PL)](https://opensource.org/licenses/MS-PL)
	//
	/*! *****************************************************************************
	Copyright (c) Microsoft Corporation.

	Permission to use, copy, modify, and/or distribute this software for any
	purpose with or without fee is hereby granted.

	THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
	REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
	AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
	INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
	LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
	OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
	PERFORMANCE OF THIS SOFTWARE.
	***************************************************************************** */
	//
	exports.RangeToLspRange = function (document, range) {
	  const fullContents = document.getTextInRange(new Range(0, document.length));
	  let chars = 0;
	  let startLspRange;
	  const lines = fullContents.split(document.eol);
	  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
	    const lineLength = lines[lineIndex].length + document.eol.length;
	    if (!startLspRange && chars + lineLength >= range.start) {
	      const character = range.start - chars;
	      startLspRange = { line: lineIndex, character };
	    }
	    if (startLspRange && chars + lineLength >= range.end) {
	      const character = range.end - chars;
	      return {
	        start: startLspRange,
	        end: { line: lineIndex, character },
	      };
	    }
	    chars += lineLength;
	  }
	  return null;
	};

	// Turn an LSP row-column range to a Nova start-end range.
	// From https://github.com/apexskier/nova-typescript
	exports.LspRangeToRange = function (document, range) {
	  const fullContents = document.getTextInRange(new Range(0, document.length));
	  let rangeStart = 0;
	  let rangeEnd = 0;
	  let chars = 0;
	  const lines = fullContents.split(document.eol);
	  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
	    const lineLength = lines[lineIndex].length + document.eol.length;
	    if (range.start.line === lineIndex) {
	      rangeStart = chars + range.start.character;
	    }
	    if (range.end.line === lineIndex) {
	      rangeEnd = chars + range.end.character;
	      break;
	    }
	    chars += lineLength;
	  }
	  if (nova.inDevMode()) {
	    console.info(
	      `LspRangeToRange() — Range Start: ${rangeStart}; Range End: ${rangeEnd}; Start > End? ${
	        rangeStart > rangeEnd
	      }`
	    );
	  }
	  if (rangeStart < rangeEnd) {
	    return new Range(rangeStart, rangeEnd);
	  } else {
	    return undefined;
	  }
	  // } else if (rangeStart > rangeEnd) {
	  //   return new Range(rangeEnd, rangeStart);
	  // } else {
	  //   // if they're equal, we'll probably want to change this line only...
	  //   return new Range(rangeStart, rangeEnd + 1)
	  // }
	};

	// Apply a TextDocumentEdit
	// https://microsoft.github.io/language-server-protocol/specifications/specification-current/#textDocumentEdit
	exports.ApplyTextDocumentEdit = (tde) => {
	  if (tde && tde.textDocument && tde.edits) {
	    // Obtain a Nova TextEditor for the document
	    return nova.workspace
	      .openFile(tde.textDocument.uri)
	      .then((editor) => {
	        //        exports.ApplyTextEdits(editor, tde.edits);
	        return exports.ApplyTextEditsRevamped(editor, tde.edits); // making an experiment
	      })
	      .catch((err) => {
	        console.error("error opening file", err);
	      });
	  } else {
	    console.info("no edits to apply, it seems");
	  }
	};

	// Apply a TextEdit[]
	// https://microsoft.github.io/language-server-protocol/specifications/specification-current/#textEdit
	exports.ApplyTextEdits = (editor, edits) => {
	  return editor
	    .edit((tee) => {
	      edits.reverse().forEach((e) => {
	        var r0 = exports.LspRangeToRange(editor.document, e.range);
	        var r1 = new Range(r0.start, r0.end);
	        tee.replace(r1, e.newText);
	      });
	    })
	    .then(() => {
	      console.info(
	        `${edits.length} changes applied to ${editor.document.path}`
	      );
	    });
	};

	// NovaPositionFromLSPRange calculates the position relative to LSP (line; character).
	// Conceptually similar to LspRangeToRange, but with a different purpose (see ApplyTextEditsRevamped).
	// Note: this will very likely blow up since calculations assume UTF-16 (don't you hate Microsoft?)
	// (gwyneth 20210406)
	exports.NovaPositionsFromLSPRangeElement = function (
	  document,
	  lspLine,
	  lspCharacter
	) {
	  const fullContents = document.getTextInRange(new Range(0, document.length));
	  let position = 0;
	  let chars = 0;
	  const lines = fullContents.split(document.eol);
	  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
	    const lineLength = lines[lineIndex].length + document.eol.length;
	    if (lspLine === lineIndex) {
	      position = chars + lspCharacter;
	      // break; // we can save a few cycles
	      return position; // get out of the loop as early as possible
	    }
	    chars += lineLength;
	  }
	  /*  if (nova.inDevMode()) {
	    console.info(`NovaPositionsFromLSPRangeElement() — LSP Line: ${lspLine}; LSP Column: ${lspCharacter}; Nova Position: ${position}`);
	  }*/
	  return position;
	};

	// ApplyTextEditsRevamped calculates if a bit of formatted has to be inserted, replaced, or removed.
	// Using ApplyTextEdits will just work for inserting formatted text; but we need a bit more logic in our case
	// See also https://github.com/microsoft/language-server-protocol/blob/gh-pages/_specifications/specification-3-17.md#textEdit to understand how insert/replace/remove is signalled by the LSP (gwyneth 20210406)
	exports.ApplyTextEditsRevamped = (editor, edits) => {
	  return editor
	    .edit((tee) => {
	      // tee - text editor edit (that's how Panic calls it!)
	      edits
	        .slice()
	        .reverse()
	        .forEach((e) => {
	          // stupid, but gopls sends these in *reverse* order!! (gwyneth 20210407)
	          // very, very inefficient for now, but we will improve later using just one loop (gwyneth 20210406)
	          var startPosition = exports.NovaPositionsFromLSPRangeElement(
	            editor.document,
	            e.range.start.line,
	            e.range.start.character
	          );
	          var endPosition = exports.NovaPositionsFromLSPRangeElement(
	            editor.document,
	            e.range.end.line,
	            e.range.end.character
	          );

	          if (e.newText == null || e.newText == undefined || e.newText == "") {
	            // this means we're going to _delete_ the characters in the range, and that the range must be valid
	            var deletedRange = new Range(startPosition, endPosition - 1);
	            tee.delete(deletedRange);
	            console.info(
	              `Deleting text from (${e.range.start.line},${e.range.start.character}) to (${e.range.end.line},${e.range.end.character}) [${startPosition}-${endPosition}]`
	            );
	          } else if (startPosition == endPosition) {
	            // this means insert a new range
	            tee.insert(startPosition, e.newText);
	            console.info(
	              `Inserting «${e.newText}» at (${e.range.start.line},${e.range.start.character}) [${startPosition}]`
	            );
	          } else if (startPosition < endPosiiton) {
	            var replacedRange = new Range(startPosition, endPosition - 1);
	            tee.replace(replacedRange, e.newText);
	            console.info(
	              `Replacing from (${e.range.start.line},${e.range.start.character}) to (${e.range.end.line},${e.range.end.character}) [${startPosition}-${endPosition}] with «${e.newText}»`
	            );
	          } else {
	            console.error(
	              `Something bad happened, we should have never reached this spot! We got LSP range: (${e.range.start.line},${e.range.start.character}) to (${e.range.end.line},${e.range.end.character}), Nova Range: [${startPosition}-${endPosition}], text: «${e.newText}»`
	            );
	          }
	        });
	    })
	    .then(() => {
	      console.info(
	        `${edits.length} changes applied to ${editor.document.path}`
	      );
	    });
	};
} (lsp$1));

/**
 * This library modifies the diff-patch-match library by Neil Fraser
 * by removing the patch and match functionality and certain advanced
 * options in the diff function. The original license is as follows:
 *
 * ===
 *
 * Diff Match and Patch
 *
 * Copyright 2006 Google Inc.
 * http://code.google.com/p/google-diff-match-patch/
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * The data structure representing a diff is an array of tuples:
 * [[DIFF_DELETE, 'Hello'], [DIFF_INSERT, 'Goodbye'], [DIFF_EQUAL, ' world.']]
 * which means: delete 'Hello', add 'Goodbye' and keep ' world.'
 */
var DIFF_DELETE = -1;
var DIFF_INSERT = 1;
var DIFF_EQUAL = 0;


/**
 * Find the differences between two texts.  Simplifies the problem by stripping
 * any common prefix or suffix off the texts before diffing.
 * @param {string} text1 Old string to be diffed.
 * @param {string} text2 New string to be diffed.
 * @param {Int|Object} [cursor_pos] Edit position in text1 or object with more info
 * @return {Array} Array of diff tuples.
 */
function diff_main(text1, text2, cursor_pos, _fix_unicode) {
  // Check for equality
  if (text1 === text2) {
    if (text1) {
      return [[DIFF_EQUAL, text1]];
    }
    return [];
  }

  if (cursor_pos != null) {
    var editdiff = find_cursor_edit_diff(text1, text2, cursor_pos);
    if (editdiff) {
      return editdiff;
    }
  }

  // Trim off common prefix (speedup).
  var commonlength = diff_commonPrefix(text1, text2);
  var commonprefix = text1.substring(0, commonlength);
  text1 = text1.substring(commonlength);
  text2 = text2.substring(commonlength);

  // Trim off common suffix (speedup).
  commonlength = diff_commonSuffix(text1, text2);
  var commonsuffix = text1.substring(text1.length - commonlength);
  text1 = text1.substring(0, text1.length - commonlength);
  text2 = text2.substring(0, text2.length - commonlength);

  // Compute the diff on the middle block.
  var diffs = diff_compute_(text1, text2);

  // Restore the prefix and suffix.
  if (commonprefix) {
    diffs.unshift([DIFF_EQUAL, commonprefix]);
  }
  if (commonsuffix) {
    diffs.push([DIFF_EQUAL, commonsuffix]);
  }
  diff_cleanupMerge(diffs, _fix_unicode);
  return diffs;
}

/**
 * Find the differences between two texts.  Assumes that the texts do not
 * have any common prefix or suffix.
 * @param {string} text1 Old string to be diffed.
 * @param {string} text2 New string to be diffed.
 * @return {Array} Array of diff tuples.
 */
function diff_compute_(text1, text2) {
  var diffs;

  if (!text1) {
    // Just add some text (speedup).
    return [[DIFF_INSERT, text2]];
  }

  if (!text2) {
    // Just delete some text (speedup).
    return [[DIFF_DELETE, text1]];
  }

  var longtext = text1.length > text2.length ? text1 : text2;
  var shorttext = text1.length > text2.length ? text2 : text1;
  var i = longtext.indexOf(shorttext);
  if (i !== -1) {
    // Shorter text is inside the longer text (speedup).
    diffs = [
      [DIFF_INSERT, longtext.substring(0, i)],
      [DIFF_EQUAL, shorttext],
      [DIFF_INSERT, longtext.substring(i + shorttext.length)]
    ];
    // Swap insertions for deletions if diff is reversed.
    if (text1.length > text2.length) {
      diffs[0][0] = diffs[2][0] = DIFF_DELETE;
    }
    return diffs;
  }

  if (shorttext.length === 1) {
    // Single character string.
    // After the previous speedup, the character can't be an equality.
    return [[DIFF_DELETE, text1], [DIFF_INSERT, text2]];
  }

  // Check to see if the problem can be split in two.
  var hm = diff_halfMatch_(text1, text2);
  if (hm) {
    // A half-match was found, sort out the return data.
    var text1_a = hm[0];
    var text1_b = hm[1];
    var text2_a = hm[2];
    var text2_b = hm[3];
    var mid_common = hm[4];
    // Send both pairs off for separate processing.
    var diffs_a = diff_main(text1_a, text2_a);
    var diffs_b = diff_main(text1_b, text2_b);
    // Merge the results.
    return diffs_a.concat([[DIFF_EQUAL, mid_common]], diffs_b);
  }

  return diff_bisect_(text1, text2);
}

/**
 * Find the 'middle snake' of a diff, split the problem in two
 * and return the recursively constructed diff.
 * See Myers 1986 paper: An O(ND) Difference Algorithm and Its Variations.
 * @param {string} text1 Old string to be diffed.
 * @param {string} text2 New string to be diffed.
 * @return {Array} Array of diff tuples.
 * @private
 */
function diff_bisect_(text1, text2) {
  // Cache the text lengths to prevent multiple calls.
  var text1_length = text1.length;
  var text2_length = text2.length;
  var max_d = Math.ceil((text1_length + text2_length) / 2);
  var v_offset = max_d;
  var v_length = 2 * max_d;
  var v1 = new Array(v_length);
  var v2 = new Array(v_length);
  // Setting all elements to -1 is faster in Chrome & Firefox than mixing
  // integers and undefined.
  for (var x = 0; x < v_length; x++) {
    v1[x] = -1;
    v2[x] = -1;
  }
  v1[v_offset + 1] = 0;
  v2[v_offset + 1] = 0;
  var delta = text1_length - text2_length;
  // If the total number of characters is odd, then the front path will collide
  // with the reverse path.
  var front = (delta % 2 !== 0);
  // Offsets for start and end of k loop.
  // Prevents mapping of space beyond the grid.
  var k1start = 0;
  var k1end = 0;
  var k2start = 0;
  var k2end = 0;
  for (var d = 0; d < max_d; d++) {
    // Walk the front path one step.
    for (var k1 = -d + k1start; k1 <= d - k1end; k1 += 2) {
      var k1_offset = v_offset + k1;
      var x1;
      if (k1 === -d || (k1 !== d && v1[k1_offset - 1] < v1[k1_offset + 1])) {
        x1 = v1[k1_offset + 1];
      } else {
        x1 = v1[k1_offset - 1] + 1;
      }
      var y1 = x1 - k1;
      while (
        x1 < text1_length && y1 < text2_length &&
        text1.charAt(x1) === text2.charAt(y1)
      ) {
        x1++;
        y1++;
      }
      v1[k1_offset] = x1;
      if (x1 > text1_length) {
        // Ran off the right of the graph.
        k1end += 2;
      } else if (y1 > text2_length) {
        // Ran off the bottom of the graph.
        k1start += 2;
      } else if (front) {
        var k2_offset = v_offset + delta - k1;
        if (k2_offset >= 0 && k2_offset < v_length && v2[k2_offset] !== -1) {
          // Mirror x2 onto top-left coordinate system.
          var x2 = text1_length - v2[k2_offset];
          if (x1 >= x2) {
            // Overlap detected.
            return diff_bisectSplit_(text1, text2, x1, y1);
          }
        }
      }
    }

    // Walk the reverse path one step.
    for (var k2 = -d + k2start; k2 <= d - k2end; k2 += 2) {
      var k2_offset = v_offset + k2;
      var x2;
      if (k2 === -d || (k2 !== d && v2[k2_offset - 1] < v2[k2_offset + 1])) {
        x2 = v2[k2_offset + 1];
      } else {
        x2 = v2[k2_offset - 1] + 1;
      }
      var y2 = x2 - k2;
      while (
        x2 < text1_length && y2 < text2_length &&
        text1.charAt(text1_length - x2 - 1) === text2.charAt(text2_length - y2 - 1)
      ) {
        x2++;
        y2++;
      }
      v2[k2_offset] = x2;
      if (x2 > text1_length) {
        // Ran off the left of the graph.
        k2end += 2;
      } else if (y2 > text2_length) {
        // Ran off the top of the graph.
        k2start += 2;
      } else if (!front) {
        var k1_offset = v_offset + delta - k2;
        if (k1_offset >= 0 && k1_offset < v_length && v1[k1_offset] !== -1) {
          var x1 = v1[k1_offset];
          var y1 = v_offset + x1 - k1_offset;
          // Mirror x2 onto top-left coordinate system.
          x2 = text1_length - x2;
          if (x1 >= x2) {
            // Overlap detected.
            return diff_bisectSplit_(text1, text2, x1, y1);
          }
        }
      }
    }
  }
  // Diff took too long and hit the deadline or
  // number of diffs equals number of characters, no commonality at all.
  return [[DIFF_DELETE, text1], [DIFF_INSERT, text2]];
}

/**
 * Given the location of the 'middle snake', split the diff in two parts
 * and recurse.
 * @param {string} text1 Old string to be diffed.
 * @param {string} text2 New string to be diffed.
 * @param {number} x Index of split point in text1.
 * @param {number} y Index of split point in text2.
 * @return {Array} Array of diff tuples.
 */
function diff_bisectSplit_(text1, text2, x, y) {
  var text1a = text1.substring(0, x);
  var text2a = text2.substring(0, y);
  var text1b = text1.substring(x);
  var text2b = text2.substring(y);

  // Compute both diffs serially.
  var diffs = diff_main(text1a, text2a);
  var diffsb = diff_main(text1b, text2b);

  return diffs.concat(diffsb);
}

/**
 * Determine the common prefix of two strings.
 * @param {string} text1 First string.
 * @param {string} text2 Second string.
 * @return {number} The number of characters common to the start of each
 *     string.
 */
function diff_commonPrefix(text1, text2) {
  // Quick check for common null cases.
  if (!text1 || !text2 || text1.charAt(0) !== text2.charAt(0)) {
    return 0;
  }
  // Binary search.
  // Performance analysis: http://neil.fraser.name/news/2007/10/09/
  var pointermin = 0;
  var pointermax = Math.min(text1.length, text2.length);
  var pointermid = pointermax;
  var pointerstart = 0;
  while (pointermin < pointermid) {
    if (
      text1.substring(pointerstart, pointermid) ==
      text2.substring(pointerstart, pointermid)
    ) {
      pointermin = pointermid;
      pointerstart = pointermin;
    } else {
      pointermax = pointermid;
    }
    pointermid = Math.floor((pointermax - pointermin) / 2 + pointermin);
  }

  if (is_surrogate_pair_start(text1.charCodeAt(pointermid - 1))) {
    pointermid--;
  }

  return pointermid;
}

/**
 * Determine the common suffix of two strings.
 * @param {string} text1 First string.
 * @param {string} text2 Second string.
 * @return {number} The number of characters common to the end of each string.
 */
function diff_commonSuffix(text1, text2) {
  // Quick check for common null cases.
  if (!text1 || !text2 || text1.slice(-1) !== text2.slice(-1)) {
    return 0;
  }
  // Binary search.
  // Performance analysis: http://neil.fraser.name/news/2007/10/09/
  var pointermin = 0;
  var pointermax = Math.min(text1.length, text2.length);
  var pointermid = pointermax;
  var pointerend = 0;
  while (pointermin < pointermid) {
    if (
      text1.substring(text1.length - pointermid, text1.length - pointerend) ==
      text2.substring(text2.length - pointermid, text2.length - pointerend)
    ) {
      pointermin = pointermid;
      pointerend = pointermin;
    } else {
      pointermax = pointermid;
    }
    pointermid = Math.floor((pointermax - pointermin) / 2 + pointermin);
  }

  if (is_surrogate_pair_end(text1.charCodeAt(text1.length - pointermid))) {
    pointermid--;
  }

  return pointermid;
}

/**
 * Do the two texts share a substring which is at least half the length of the
 * longer text?
 * This speedup can produce non-minimal diffs.
 * @param {string} text1 First string.
 * @param {string} text2 Second string.
 * @return {Array.<string>} Five element Array, containing the prefix of
 *     text1, the suffix of text1, the prefix of text2, the suffix of
 *     text2 and the common middle.  Or null if there was no match.
 */
function diff_halfMatch_(text1, text2) {
  var longtext = text1.length > text2.length ? text1 : text2;
  var shorttext = text1.length > text2.length ? text2 : text1;
  if (longtext.length < 4 || shorttext.length * 2 < longtext.length) {
    return null;  // Pointless.
  }

  /**
   * Does a substring of shorttext exist within longtext such that the substring
   * is at least half the length of longtext?
   * Closure, but does not reference any external variables.
   * @param {string} longtext Longer string.
   * @param {string} shorttext Shorter string.
   * @param {number} i Start index of quarter length substring within longtext.
   * @return {Array.<string>} Five element Array, containing the prefix of
   *     longtext, the suffix of longtext, the prefix of shorttext, the suffix
   *     of shorttext and the common middle.  Or null if there was no match.
   * @private
   */
  function diff_halfMatchI_(longtext, shorttext, i) {
    // Start with a 1/4 length substring at position i as a seed.
    var seed = longtext.substring(i, i + Math.floor(longtext.length / 4));
    var j = -1;
    var best_common = '';
    var best_longtext_a, best_longtext_b, best_shorttext_a, best_shorttext_b;
    while ((j = shorttext.indexOf(seed, j + 1)) !== -1) {
      var prefixLength = diff_commonPrefix(
        longtext.substring(i), shorttext.substring(j));
      var suffixLength = diff_commonSuffix(
        longtext.substring(0, i), shorttext.substring(0, j));
      if (best_common.length < suffixLength + prefixLength) {
        best_common = shorttext.substring(
          j - suffixLength, j) + shorttext.substring(j, j + prefixLength);
        best_longtext_a = longtext.substring(0, i - suffixLength);
        best_longtext_b = longtext.substring(i + prefixLength);
        best_shorttext_a = shorttext.substring(0, j - suffixLength);
        best_shorttext_b = shorttext.substring(j + prefixLength);
      }
    }
    if (best_common.length * 2 >= longtext.length) {
      return [
        best_longtext_a, best_longtext_b,
        best_shorttext_a, best_shorttext_b, best_common
      ];
    } else {
      return null;
    }
  }

  // First check if the second quarter is the seed for a half-match.
  var hm1 = diff_halfMatchI_(longtext, shorttext, Math.ceil(longtext.length / 4));
  // Check again based on the third quarter.
  var hm2 = diff_halfMatchI_(longtext, shorttext, Math.ceil(longtext.length / 2));
  var hm;
  if (!hm1 && !hm2) {
    return null;
  } else if (!hm2) {
    hm = hm1;
  } else if (!hm1) {
    hm = hm2;
  } else {
    // Both matched.  Select the longest.
    hm = hm1[4].length > hm2[4].length ? hm1 : hm2;
  }

  // A half-match was found, sort out the return data.
  var text1_a, text1_b, text2_a, text2_b;
  if (text1.length > text2.length) {
    text1_a = hm[0];
    text1_b = hm[1];
    text2_a = hm[2];
    text2_b = hm[3];
  } else {
    text2_a = hm[0];
    text2_b = hm[1];
    text1_a = hm[2];
    text1_b = hm[3];
  }
  var mid_common = hm[4];
  return [text1_a, text1_b, text2_a, text2_b, mid_common];
}

/**
 * Reorder and merge like edit sections.  Merge equalities.
 * Any edit section can move as long as it doesn't cross an equality.
 * @param {Array} diffs Array of diff tuples.
 * @param {boolean} fix_unicode Whether to normalize to a unicode-correct diff
 */
function diff_cleanupMerge(diffs, fix_unicode) {
  diffs.push([DIFF_EQUAL, '']);  // Add a dummy entry at the end.
  var pointer = 0;
  var count_delete = 0;
  var count_insert = 0;
  var text_delete = '';
  var text_insert = '';
  var commonlength;
  while (pointer < diffs.length) {
    if (pointer < diffs.length - 1 && !diffs[pointer][1]) {
      diffs.splice(pointer, 1);
      continue;
    }
    switch (diffs[pointer][0]) {
      case DIFF_INSERT:

        count_insert++;
        text_insert += diffs[pointer][1];
        pointer++;
        break;
      case DIFF_DELETE:
        count_delete++;
        text_delete += diffs[pointer][1];
        pointer++;
        break;
      case DIFF_EQUAL:
        var previous_equality = pointer - count_insert - count_delete - 1;
        if (fix_unicode) {
          // prevent splitting of unicode surrogate pairs.  when fix_unicode is true,
          // we assume that the old and new text in the diff are complete and correct
          // unicode-encoded JS strings, but the tuple boundaries may fall between
          // surrogate pairs.  we fix this by shaving off stray surrogates from the end
          // of the previous equality and the beginning of this equality.  this may create
          // empty equalities or a common prefix or suffix.  for example, if AB and AC are
          // emojis, `[[0, 'A'], [-1, 'BA'], [0, 'C']]` would turn into deleting 'ABAC' and
          // inserting 'AC', and then the common suffix 'AC' will be eliminated.  in this
          // particular case, both equalities go away, we absorb any previous inequalities,
          // and we keep scanning for the next equality before rewriting the tuples.
          if (previous_equality >= 0 && ends_with_pair_start(diffs[previous_equality][1])) {
            var stray = diffs[previous_equality][1].slice(-1);
            diffs[previous_equality][1] = diffs[previous_equality][1].slice(0, -1);
            text_delete = stray + text_delete;
            text_insert = stray + text_insert;
            if (!diffs[previous_equality][1]) {
              // emptied out previous equality, so delete it and include previous delete/insert
              diffs.splice(previous_equality, 1);
              pointer--;
              var k = previous_equality - 1;
              if (diffs[k] && diffs[k][0] === DIFF_INSERT) {
                count_insert++;
                text_insert = diffs[k][1] + text_insert;
                k--;
              }
              if (diffs[k] && diffs[k][0] === DIFF_DELETE) {
                count_delete++;
                text_delete = diffs[k][1] + text_delete;
                k--;
              }
              previous_equality = k;
            }
          }
          if (starts_with_pair_end(diffs[pointer][1])) {
            var stray = diffs[pointer][1].charAt(0);
            diffs[pointer][1] = diffs[pointer][1].slice(1);
            text_delete += stray;
            text_insert += stray;
          }
        }
        if (pointer < diffs.length - 1 && !diffs[pointer][1]) {
          // for empty equality not at end, wait for next equality
          diffs.splice(pointer, 1);
          break;
        }
        if (text_delete.length > 0 || text_insert.length > 0) {
          // note that diff_commonPrefix and diff_commonSuffix are unicode-aware
          if (text_delete.length > 0 && text_insert.length > 0) {
            // Factor out any common prefixes.
            commonlength = diff_commonPrefix(text_insert, text_delete);
            if (commonlength !== 0) {
              if (previous_equality >= 0) {
                diffs[previous_equality][1] += text_insert.substring(0, commonlength);
              } else {
                diffs.splice(0, 0, [DIFF_EQUAL, text_insert.substring(0, commonlength)]);
                pointer++;
              }
              text_insert = text_insert.substring(commonlength);
              text_delete = text_delete.substring(commonlength);
            }
            // Factor out any common suffixes.
            commonlength = diff_commonSuffix(text_insert, text_delete);
            if (commonlength !== 0) {
              diffs[pointer][1] =
                text_insert.substring(text_insert.length - commonlength) + diffs[pointer][1];
              text_insert = text_insert.substring(0, text_insert.length - commonlength);
              text_delete = text_delete.substring(0, text_delete.length - commonlength);
            }
          }
          // Delete the offending records and add the merged ones.
          var n = count_insert + count_delete;
          if (text_delete.length === 0 && text_insert.length === 0) {
            diffs.splice(pointer - n, n);
            pointer = pointer - n;
          } else if (text_delete.length === 0) {
            diffs.splice(pointer - n, n, [DIFF_INSERT, text_insert]);
            pointer = pointer - n + 1;
          } else if (text_insert.length === 0) {
            diffs.splice(pointer - n, n, [DIFF_DELETE, text_delete]);
            pointer = pointer - n + 1;
          } else {
            diffs.splice(pointer - n, n, [DIFF_DELETE, text_delete], [DIFF_INSERT, text_insert]);
            pointer = pointer - n + 2;
          }
        }
        if (pointer !== 0 && diffs[pointer - 1][0] === DIFF_EQUAL) {
          // Merge this equality with the previous one.
          diffs[pointer - 1][1] += diffs[pointer][1];
          diffs.splice(pointer, 1);
        } else {
          pointer++;
        }
        count_insert = 0;
        count_delete = 0;
        text_delete = '';
        text_insert = '';
        break;
    }
  }
  if (diffs[diffs.length - 1][1] === '') {
    diffs.pop();  // Remove the dummy entry at the end.
  }

  // Second pass: look for single edits surrounded on both sides by equalities
  // which can be shifted sideways to eliminate an equality.
  // e.g: A<ins>BA</ins>C -> <ins>AB</ins>AC
  var changes = false;
  pointer = 1;
  // Intentionally ignore the first and last element (don't need checking).
  while (pointer < diffs.length - 1) {
    if (diffs[pointer - 1][0] === DIFF_EQUAL &&
      diffs[pointer + 1][0] === DIFF_EQUAL) {
      // This is a single edit surrounded by equalities.
      if (diffs[pointer][1].substring(diffs[pointer][1].length -
        diffs[pointer - 1][1].length) === diffs[pointer - 1][1]) {
        // Shift the edit over the previous equality.
        diffs[pointer][1] = diffs[pointer - 1][1] +
          diffs[pointer][1].substring(0, diffs[pointer][1].length -
            diffs[pointer - 1][1].length);
        diffs[pointer + 1][1] = diffs[pointer - 1][1] + diffs[pointer + 1][1];
        diffs.splice(pointer - 1, 1);
        changes = true;
      } else if (diffs[pointer][1].substring(0, diffs[pointer + 1][1].length) ==
        diffs[pointer + 1][1]) {
        // Shift the edit over the next equality.
        diffs[pointer - 1][1] += diffs[pointer + 1][1];
        diffs[pointer][1] =
          diffs[pointer][1].substring(diffs[pointer + 1][1].length) +
          diffs[pointer + 1][1];
        diffs.splice(pointer + 1, 1);
        changes = true;
      }
    }
    pointer++;
  }
  // If shifts were made, the diff needs reordering and another shift sweep.
  if (changes) {
    diff_cleanupMerge(diffs, fix_unicode);
  }
}
function is_surrogate_pair_start(charCode) {
  return charCode >= 0xD800 && charCode <= 0xDBFF;
}

function is_surrogate_pair_end(charCode) {
  return charCode >= 0xDC00 && charCode <= 0xDFFF;
}

function starts_with_pair_end(str) {
  return is_surrogate_pair_end(str.charCodeAt(0));
}

function ends_with_pair_start(str) {
  return is_surrogate_pair_start(str.charCodeAt(str.length - 1));
}

function remove_empty_tuples(tuples) {
  var ret = [];
  for (var i = 0; i < tuples.length; i++) {
    if (tuples[i][1].length > 0) {
      ret.push(tuples[i]);
    }
  }
  return ret;
}

function make_edit_splice(before, oldMiddle, newMiddle, after) {
  if (ends_with_pair_start(before) || starts_with_pair_end(after)) {
    return null;
  }
  return remove_empty_tuples([
    [DIFF_EQUAL, before],
    [DIFF_DELETE, oldMiddle],
    [DIFF_INSERT, newMiddle],
    [DIFF_EQUAL, after]
  ]);
}

function find_cursor_edit_diff(oldText, newText, cursor_pos) {
  // note: this runs after equality check has ruled out exact equality
  var oldRange = typeof cursor_pos === 'number' ?
    { index: cursor_pos, length: 0 } : cursor_pos.oldRange;
  var newRange = typeof cursor_pos === 'number' ?
    null : cursor_pos.newRange;
  // take into account the old and new selection to generate the best diff
  // possible for a text edit.  for example, a text change from "xxx" to "xx"
  // could be a delete or forwards-delete of any one of the x's, or the
  // result of selecting two of the x's and typing "x".
  var oldLength = oldText.length;
  var newLength = newText.length;
  if (oldRange.length === 0 && (newRange === null || newRange.length === 0)) {
    // see if we have an insert or delete before or after cursor
    var oldCursor = oldRange.index;
    var oldBefore = oldText.slice(0, oldCursor);
    var oldAfter = oldText.slice(oldCursor);
    var maybeNewCursor = newRange ? newRange.index : null;
    editBefore: {
      // is this an insert or delete right before oldCursor?
      var newCursor = oldCursor + newLength - oldLength;
      if (maybeNewCursor !== null && maybeNewCursor !== newCursor) {
        break editBefore;
      }
      if (newCursor < 0 || newCursor > newLength) {
        break editBefore;
      }
      var newBefore = newText.slice(0, newCursor);
      var newAfter = newText.slice(newCursor);
      if (newAfter !== oldAfter) {
        break editBefore;
      }
      var prefixLength = Math.min(oldCursor, newCursor);
      var oldPrefix = oldBefore.slice(0, prefixLength);
      var newPrefix = newBefore.slice(0, prefixLength);
      if (oldPrefix !== newPrefix) {
        break editBefore;
      }
      var oldMiddle = oldBefore.slice(prefixLength);
      var newMiddle = newBefore.slice(prefixLength);
      return make_edit_splice(oldPrefix, oldMiddle, newMiddle, oldAfter);
    }
    editAfter: {
      // is this an insert or delete right after oldCursor?
      if (maybeNewCursor !== null && maybeNewCursor !== oldCursor) {
        break editAfter;
      }
      var cursor = oldCursor;
      var newBefore = newText.slice(0, cursor);
      var newAfter = newText.slice(cursor);
      if (newBefore !== oldBefore) {
        break editAfter;
      }
      var suffixLength = Math.min(oldLength - cursor, newLength - cursor);
      var oldSuffix = oldAfter.slice(oldAfter.length - suffixLength);
      var newSuffix = newAfter.slice(newAfter.length - suffixLength);
      if (oldSuffix !== newSuffix) {
        break editAfter;
      }
      var oldMiddle = oldAfter.slice(0, oldAfter.length - suffixLength);
      var newMiddle = newAfter.slice(0, newAfter.length - suffixLength);
      return make_edit_splice(oldBefore, oldMiddle, newMiddle, oldSuffix);
    }
  }
  if (oldRange.length > 0 && newRange && newRange.length === 0) {
    replaceRange: {
      // see if diff could be a splice of the old selection range
      var oldPrefix = oldText.slice(0, oldRange.index);
      var oldSuffix = oldText.slice(oldRange.index + oldRange.length);
      var prefixLength = oldPrefix.length;
      var suffixLength = oldSuffix.length;
      if (newLength < prefixLength + suffixLength) {
        break replaceRange;
      }
      var newPrefix = newText.slice(0, prefixLength);
      var newSuffix = newText.slice(newLength - suffixLength);
      if (oldPrefix !== newPrefix || oldSuffix !== newSuffix) {
        break replaceRange;
      }
      var oldMiddle = oldText.slice(prefixLength, oldLength - suffixLength);
      var newMiddle = newText.slice(prefixLength, newLength - suffixLength);
      return make_edit_splice(oldPrefix, oldMiddle, newMiddle, oldSuffix);
    }
  }

  return null;
}

function diff$1(text1, text2, cursor_pos) {
  // only pass fix_unicode=true at the top level, not when diff_main is
  // recursively invoked
  return diff_main(text1, text2, cursor_pos, true);
}

diff$1.INSERT = DIFF_INSERT;
diff$1.DELETE = DIFF_DELETE;
diff$1.EQUAL = DIFF_EQUAL;

var diff_1 = diff$1;

const diff = diff_1;

const POSSIBLE_CURSORS = String.fromCharCode(
  0xfffd,
  0xffff,
  0x1f094,
  0x1f08d,
  0xe004,
  0x1f08d
).split("");

let Formatter$1 = class Formatter {
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
};

var formatter = {
  Formatter: Formatter$1,
};

function showError$1(id, title, body) {
  let request = new NotificationRequest(id);

  request.title = nova.localize(title);
  request.body = nova.localize(body);
  request.actions = [nova.localize("OK")];

  nova.notifications.add(request).catch((err) => console.error(err, err.stack));
}

function showActionableError(id, title, body, actions, callback) {
  let request = new NotificationRequest(id);

  request.title = nova.localize(title);
  request.body = nova.localize(body);
  request.actions = actions.map((action) => nova.localize(action));

  nova.notifications
    .add(request)
    .then((response) => callback(response.actionIdx))
    .catch((err) => console.error(err, err.stack));
}

function getConfigWithWorkspaceOverride$1(name) {
  const workspaceConfig = getWorkspaceConfig(name);
  const extensionConfig = nova.config.get(name);

  return workspaceConfig === null ? extensionConfig : workspaceConfig;
}

function observeConfigWithWorkspaceOverride$1(name, fn) {
  let ignored = false;
  function wrapped(...args) {
    if (!ignored) {
      ignored = true;
      return;
    }
    fn.apply(this, args);
  }
  nova.workspace.config.observe(name, wrapped);
  nova.config.observe(name, wrapped);
}

function observeConfigDidChange$1(name, fn) {
  let ignored = false;
  function wrapped(...args) {
    if (!ignored) {
      ignored = true;
      return;
    }

    fn.apply(this, args);
  }
  nova.config.onDidChange(name, wrapped);
}

function getWorkspaceConfig(name) {
  const value = nova.workspace.config.get(name);
  switch (value) {
    case "Enable":
      return true;
    case "Disable":
      return false;
    case "Global Default":
      return null;
    default:
      return value;
  }
}

function handleProcessResult(process, reject, resolve) {
  const errors = [];
  process.onStderr((err) => {
    errors.push(err);
  });

  process.onDidExit((status) => {
    if (status === 0) {
      if (resolve) resolve();
      return;
    }

    reject(new ProcessError(status, errors.join("\n")));
  });
}

var helpers = {
  showError: showError$1,
  showActionableError,
  getConfigWithWorkspaceOverride: getConfigWithWorkspaceOverride$1,
  observeConfigWithWorkspaceOverride: observeConfigWithWorkspaceOverride$1,
  handleProcessResult,
  observeConfigDidChange: observeConfigDidChange$1,
};

const lsp = lsp$1;
const { Formatter } = formatter;
const {
  showError,
  getConfigWithWorkspaceOverride,
  observeConfigWithWorkspaceOverride,
  observeConfigDidChange,
} = helpers;

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

var activate = main.activate = async function () {
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

var deactivate = main.deactivate = function () {
  // Clean up state before the extension is deactivated
};

exports.activate = activate;
exports.deactivate = deactivate;
exports.default = main;
