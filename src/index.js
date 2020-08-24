var through2 = require('through2');
var utils = require('./utils');

var UnusedTagsFinder = utils.UnusedTagsFinder;
var ParsedFileMetadata = utils.ParsedFileMetadata;


const defaultOptions = {
    preserveNewLines: true,
    preserveMultipleSpaces: true,
    preserveSpacesBeforeColons: true,
    collapseSpacesBeforeRemovedColons: true,
    preserveSameLineElse: true,
    showDebugOutput: false
};

const preferredTags = {
    NEW_LINE_TAG: ["N", "n"],
    SPACES_TAG: ["S", "s"],
    SPACES_BEFORE_COLON_TAG: ["C", "c"],
    SAME_LINE_ELSE_TAG: ["E", "e"]
};

ParsedFileMetadata.FILE_METADATA_TAG = "PRESERVE_TYPESCRIPT_WHITESPACE_METADATA";


function saveWhitespace(options) {
    options = utils.extendOptionsWithDefaults(options, defaultOptions);

    return through2.obj(function (file, encoding, callback) {
        let contents = file.contents.toString(encoding);

        let unusedTagsFinder = new UnusedTagsFinder(contents, options);
        const NEW_LINE_TAG            = unusedTagsFinder.findUnusedTag(preferredTags.NEW_LINE_TAG, false);
        const SPACES_TAG              = unusedTagsFinder.findUnusedTag(preferredTags.SPACES_TAG, true);
        const SPACES_BEFORE_COLON_TAG = unusedTagsFinder.findUnusedTag(preferredTags.SPACES_BEFORE_COLON_TAG, true);
        const SAME_LINE_ELSE_TAG      = unusedTagsFinder.findUnusedTag(preferredTags.SAME_LINE_ELSE_TAG, true);

        const NEW_LINE_REPLACEMENT = "/*" + NEW_LINE_TAG + "*/$1";

        let blocks = utils.parseStringAndComments(contents);
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

        contents = utils.rebuildCodeFromBlocks(blocks);

        let metadataObj = new ParsedFileMetadata({
            options,
            NEW_LINE_TAG,
            SPACES_TAG,
            SPACES_BEFORE_COLON_TAG,
            SAME_LINE_ELSE_TAG
        });
        contents = metadataObj.serialize() + contents;

        file.contents = Buffer.from(contents, encoding);

        callback(null, file);
    });
}

function restoreWhitespace() {
    return through2.obj(function (file, encoding, callback) {
        let contents = file.contents.toString(encoding);

        let metadataObj = ParsedFileMetadata.deserialize(file, contents);
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
