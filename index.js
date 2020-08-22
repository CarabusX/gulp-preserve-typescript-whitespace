var through2 = require('through2');

const defaultOptions = {
    preserveNewLines: true,
    preserveMultipleSpaces: true,
    preserveSpacesBeforeColons: true,
    collapseSpacesBeforeRemovedColons: true,
    preserveSameLineElse: true,
    showDebugOutput: false
};

const FILE_METADATA_TAG = "PRESERVE_TYPESCRIPT_WHITESPACE_METADATA";

const preferredTags = {
    NEW_LINE_TAG: ["N", "n"],
    SPACES_TAG: ["S", "s"],
    SPACES_BEFORE_COLON_TAG: ["C", "c"],
    SAME_LINE_ELSE_TAG: ["E", "e"]
};

const TAG_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function createTagForOrdinal(ordinal) {
    let tag = ""
    do {
        let tagChar = TAG_CHARS[ordinal % TAG_CHARS.length];
        tag = tagChar + tag;
        ordinal = Math.floor(ordinal / TAG_CHARS.length);
    } while (ordinal > 0);
    return tag;
}

function isSimpleTagPresent(fileContents, tag) {
    let index = fileContents.search(new RegExp("\\/\\*" + tag + "\\*\\/"));
    return (index !== -1);
}

function isTagWithCountPresent(fileContents, tag) {
    let index = fileContents.search(new RegExp("\\/\\*" + tag + "([0-9]+)\\*\\/"));
    return (index !== -1);
}

class UnusedTagsFinder {
    constructor(fileContents, options) {
        this.fileContents = fileContents;
        this.options = options;
        this.checkedSimpleTags = new Set();
        this.checkedTagsWithCount = new Set();
    }

    findUnusedTag(preferredTags, isTagWithCount) {
        const checkedTagsSet = isTagWithCount ? this.checkedTagsWithCount : this.checkedSimpleTags;
        const isTagPresentFunc = isTagWithCount ? isTagWithCountPresent : isSimpleTagPresent;

        for (const tag of preferredTags) {
            if (!checkedTagsSet.has(tag)) {
                checkedTagsSet.add(tag);

                if (!isTagPresentFunc(this.fileContents, tag)) {
                    return tag;
                } else if (this.options.showDebugOutput) {
                    console.debug("Tag already present:", tag);
                }
            }
        }

        for (let i = 0; ; i++) {
            const tag = createTagForOrdinal(i);
            if (!checkedTagsSet.has(tag)) {
                checkedTagsSet.add(tag);

                if (!isTagPresentFunc(this.fileContents, tag)) {
                    return tag;
                } else if (this.options.showDebugOutput) {
                    console.debug("Tag already present:", tag);
                }
            }
        }
    }
}

class ParsedFileMetadata {
    constructor(metadata) {
        this.metadata = metadata;
    }

    serialize() {
        return "/*" + FILE_METADATA_TAG + JSON.stringify(this.metadata) + FILE_METADATA_TAG + "*/\n";
    }

    static deserialize(fileContents) {
        let startTag = "/*" + FILE_METADATA_TAG;
        let endTag = FILE_METADATA_TAG + "*/\n";

        let startTagIndex = fileContents.indexOf(startTag);
        let endTagIndex = fileContents.lastIndexOf(endTag);
        if (startTagIndex === -1 || endTagIndex === -1) {
            return null;
        }

        let metadataStartIndex = startTagIndex + startTag.length;
        let endIndex = endTagIndex + endTag.length;

        let serializedMetadata = fileContents.slice(metadataStartIndex, endTagIndex);
        let metadata = JSON.parse(serializedMetadata);

        let metadataObj = new ParsedFileMetadata(metadata);
        metadataObj.startIndex = startTagIndex;
        metadataObj.endIndex = endIndex;

        return metadataObj;
    }

    removeFrom(fileContents) {
        return fileContents.slice(0, this.startIndex) + fileContents.slice(this.endIndex);
    }
}


const stringOrCommentEnd = {
    "'": /(?<!(?:^|[^\\])(?:\\\\)*\\)'/, // ignore quotes preceded by odd number of slashes
    '"': /(?<!(?:^|[^\\])(?:\\\\)*\\)"/,
    "`": /(?<!(?:^|[^\\])(?:\\\\)*\\)`/,
    "//": /(?=\r?\n)/,
    "/*": /\*\//
};

function parseStringAndComments(code, skipEmptyCodeBlocks = true) {
    let codeToParse = code;
    let blocks = [];

    while (codeToParse.length > 0) {
        let codeBlock;
        let commentBlock;

        let commentStartMatch = codeToParse.match(/['"`]|\/\/|\/\*/);
        if (commentStartMatch === null) {
            codeBlock = codeToParse;
            commentBlock = "";
            codeToParse = "";
        } else {
            let commentStartIndex = commentStartMatch.index;
            codeBlock = codeToParse.slice(0, commentStartIndex);

            let commentStartChars = commentStartMatch[0];
            let commentContentsIndex = commentStartIndex + commentStartChars.length;
            let commentEndRegex = stringOrCommentEnd[commentStartChars];
            let commentEndMatch = codeToParse.slice(commentContentsIndex).match(commentEndRegex);
            if (commentEndMatch === null) {
                commentBlock = codeToParse.slice(commentStartIndex);
                codeToParse = "";
            } else {
                let commentEndIndexRelative = commentEndMatch.index;
                let commentEndChars = commentEndMatch[0];
                let nextCodeStartIndex = commentContentsIndex + commentEndIndexRelative + commentEndChars.length;
                commentBlock = codeToParse.slice(commentStartIndex, nextCodeStartIndex);
                codeToParse = codeToParse.slice(nextCodeStartIndex);
            }
        }

        if (skipEmptyCodeBlocks && codeBlock.length === 0 && blocks.length >= 1) {
            blocks[blocks.length - 1].stringOrComment += commentBlock; // append comment to previous block's comment
        } else {
            blocks.push({ code: codeBlock, stringOrComment: commentBlock });
        }
    }

    return blocks;
}

function rebuildCodeFromBlocks(blocks) {
    return blocks
        .map(block => (block.code + block.stringOrComment))
        .join("");
}

/* Also filters out invalid keys */
function extendOptionsWithDefaults(_options, defaultOptions) {
    _options = _options || {};

    let options = {};
    for (const key of Object.keys(defaultOptions)) {
        options[key] = _options.hasOwnProperty(key) ? _options[key] : defaultOptions[key];
    }
    return options;
}

function saveWhitespace(options) {
    options = extendOptionsWithDefaults(options, defaultOptions);

    return through2.obj(function (file, encoding, callback) {
        let contents = file.contents.toString(encoding);

        let unusedTagsFinder = new UnusedTagsFinder(contents, options);
        const NEW_LINE_TAG            = unusedTagsFinder.findUnusedTag(preferredTags.NEW_LINE_TAG, false);
        const SPACES_TAG              = unusedTagsFinder.findUnusedTag(preferredTags.SPACES_TAG, true);
        const SPACES_BEFORE_COLON_TAG = unusedTagsFinder.findUnusedTag(preferredTags.SPACES_BEFORE_COLON_TAG, true);
        const SAME_LINE_ELSE_TAG      = unusedTagsFinder.findUnusedTag(preferredTags.SAME_LINE_ELSE_TAG, true);

        const NEW_LINE_REPLACEMENT = "/*" + NEW_LINE_TAG + "*/$1";

        let blocks = parseStringAndComments(contents);
        let isFileStart = true;

        for (const block of blocks) {
            if (options.preserveSameLineElse) {
                block.code = block.code
                    .replace(/\}( *)else/g, function replacer(match, group1) {
                        return "} /*" + SAME_LINE_ELSE_TAG + group1.length + "*/else";
                    })
            }

            if (options.preserveSpacesBeforeColons) {
                let regex = isFileStart ?
                    /(?<=[^ \n])( +):/g :
                    /(?<=^|[^ \n])( +):/g;

                block.code = block.code
                    .replace(regex, function replacer(match, group1) {
                        return " /*" + SPACES_BEFORE_COLON_TAG + group1.length + "*/:";
                    });
            }

            if (options.preserveMultipleSpaces) {
                let regex = isFileStart ?
                    /(?<=[^ \n])(  +)(?![ :])/g :
                    /(?<=^|[^ \n])(  +)(?![ :])/g;

                block.code = block.code
                    .replace(regex, function replacer(match, group1) {
                        return " /*" + SPACES_TAG + group1.length + "*/ ";
                    });
            }

            if (options.preserveNewLines) {
                let regex = isFileStart ?
                    /(?<=(?:^|\n)[ \t]*)(\r?\n)/g : // empty line possibly at file start
                    /(?<=\n[ \t]*)(\r?\n)/g; // empty line

                block.code = block.code
                    .replace(regex, NEW_LINE_REPLACEMENT);
            }

            isFileStart = false;
        }

        contents = rebuildCodeFromBlocks(blocks);

        let metadata = new ParsedFileMetadata({
            options,
            NEW_LINE_TAG,
            SPACES_TAG,
            SPACES_BEFORE_COLON_TAG,
            SAME_LINE_ELSE_TAG
        });
        contents = metadata.serialize() + contents;

        file.contents = Buffer.from(contents, encoding);

        callback(null, file);
    });
}

function restoreWhitespace() {
    return through2.obj(function (file, encoding, callback) {
        let contents = file.contents.toString(encoding);

        let metadataObj = ParsedFileMetadata.deserialize(contents);
        let metadata = metadataObj.metadata;
        contents = metadataObj.removeFrom(contents);

        const options                 = metadata.options;
        const NEW_LINE_TAG            = metadata.NEW_LINE_TAG;
        const SPACES_TAG              = metadata.SPACES_TAG;
        const SPACES_BEFORE_COLON_TAG = metadata.SPACES_BEFORE_COLON_TAG;
        const SAME_LINE_ELSE_TAG      = metadata.SAME_LINE_ELSE_TAG;

        if (options.preserveNewLines) {
            contents = contents.replace(new RegExp("\\/\\*" + NEW_LINE_TAG + "\\*\\/", "g"), "");
        }

        if (options.preserveSpacesBeforeColons) {
            contents = contents.replace(new RegExp(" ?\\/\\*" + SPACES_BEFORE_COLON_TAG + "([0-9]+)\\*\\/:", "g"), function replacer(match, group1) {
                let spacesCount = Number(group1);
                return " ".repeat(spacesCount) + ":";
            });

            if (options.collapseSpacesBeforeRemovedColons) {
                contents = contents.replace(new RegExp(" ?\\/\\*" + SPACES_BEFORE_COLON_TAG + "([0-9]+)\\*\\/(?=[,;\\)\\} \\t\\r\\n])", "g"), ""); // can safely collapse
                contents = contents.replace(new RegExp(" ?\\/\\*" + SPACES_BEFORE_COLON_TAG + "([0-9]+)\\*\\/", "g"), " "); // cannot fully collapse, leave one space
            } else {
                contents = contents.replace(new RegExp(" ?\\/\\*" + SPACES_BEFORE_COLON_TAG + "([0-9]+)\\*\\/", "g"), function replacer(match, group1) {
                    let spacesCount = Number(group1);
                    return " ".repeat(spacesCount);
                });
            }
        }

        if (options.preserveMultipleSpaces) {
            contents = contents.replace(new RegExp("\\/\\*" + SPACES_TAG + "([0-9]+)\\*\\/", "g"), function replacer(match, group1) {
                let spacesCount = Number(group1);
                return " ".repeat(spacesCount - 2);
            });
        }

        if (options.preserveSameLineElse) {
            contents = contents.replace(new RegExp("\\} \\/\\*" + SAME_LINE_ELSE_TAG + "([0-9]+)\\*\\/\\r?\\n[ \\t]*else", "g"), function replacer(match, group1) {
                let spacesCount = Number(group1);
                return "}" + " ".repeat(spacesCount) + "else";
            });
        }

        file.contents = Buffer.from(contents, encoding);

        callback(null, file);
    });
}

module.exports = {
    saveWhitespace,
    restoreWhitespace
};