const PLUGIN_NAME = "gulp-preserve-typescript-whitespace";


/* Also filters out invalid keys. */
function extendOptionsWithDefaults(_options, defaultOptions) {
    _options = _options || {};
    if (_options.preserveSpacesBeforeColons === undefined) {
        _options.preserveSpacesBeforeColons = _options.preserveMultipleSpaces;
    }

    let options = {};
    for (const key of Object.keys(defaultOptions)) {
        options[key] = (_options[key] !== undefined) ? _options[key] : defaultOptions[key];
    }
    return options;
}


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
                    console.debug("[" + PLUGIN_NAME + "] Tag already present:", tag);
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
                    console.debug("[" + PLUGIN_NAME + "] Tag already present:", tag);
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
        return "/*" + ParsedFileMetadata.FILE_METADATA_TAG + JSON.stringify(this.metadata) + ParsedFileMetadata.FILE_METADATA_TAG + "*/\n";
    }

    static deserialize(file, fileContents) {
        let startTag = "/*" + ParsedFileMetadata.FILE_METADATA_TAG;
        let endTag = ParsedFileMetadata.FILE_METADATA_TAG + "*/\n";

        let startTagIndex = fileContents.indexOf(startTag);
        let endTagIndex = fileContents.lastIndexOf(endTag);
        if (startTagIndex === -1 || endTagIndex === -1) {
            console.error("[" + PLUGIN_NAME + "] ERROR: Metadata tag not found in '" + file.path + "' file.")
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


module.exports = {
    extendOptionsWithDefaults,
    UnusedTagsFinder,
    ParsedFileMetadata,
    parseStringAndComments,
    rebuildCodeFromBlocks
};
