var through2 = require('through2');

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

function saveWhitespace() {
    return through2.obj(function (file, encoding, callback) {
        let contents = file.contents.toString(encoding);
        let blocks = parseStringAndComments(contents);
        let isFileStart = true;

        for (const block of blocks) {
            block.code = block.code
                .replace(/\}( *)else/g, function replacer(match, group1) {
                    return "} /*ELSE" + group1.length + "*/else";
                })

            if (isFileStart) {
                block.code = block.code
                    .replace(/(?<=[^ \n])( +):/g, function replacer(match, group1) {
                        return " /*C" + group1.length + "*/:";
                    })
                    .replace(/(?<=[^ \n])(  +)/g, function replacer(match, group1) {
                        return " /*S" + group1.length + "*/ ";
                    })
                    .replace(/(?<=(?:^|\n)[ \t]*)(\r?\n)/g, "/*N*/$1"); // empty line at file start

                isFileStart = false;
            } else {
                block.code = block.code
                    .replace(/(?<=^|[^ \n])( +):/g, function replacer(match, group1) {
                        return " /*C" + group1.length + "*/:";
                    })
                    .replace(/(?<=^|[^ \n])(  +)/g, function replacer(match, group1) {
                        return " /*S" + group1.length + "*/ ";
                    })
                    .replace(/(?<=\n[ \t]*)(\r?\n)/g, "/*N*/$1"); // empty line
            }
        }

        contents = rebuildCodeFromBlocks(blocks);
        file.contents = Buffer.from(contents, encoding);

        callback(null, file);
    });
}

function restoreWhitespace() {
    return through2.obj(function (file, encoding, callback) {
        let contents = file.contents.toString(encoding);

        // new lines
        contents = contents.replace(/\/\*N\*\//g, "");

        // spaces before :
        contents = contents.replace(/ ?\/\*C([0-9]+)\*\/:/g, function replacer(match, group1) {
            let spacesCount = Number(group1);
            return " ".repeat(spacesCount) + ":";
        });
        contents = contents.replace(/ ?\/\*C([0-9]+)\*\/(?=[,;\)\} \t\r\n])/g, ""); // can safely collapse
        contents = contents.replace(/ ?\/\*C([0-9]+)\*\//g, " "); // cannot fully collapse, leave one space

        // multiple other spaces
        contents = contents.replace(/\/\*S([0-9]+)\*\//g, function replacer(match, group1) {
            let spacesCount = Number(group1);
            return " ".repeat(spacesCount - 2);
        });

        // "} else" in separate lines
        contents = contents.replace(/\} \/\*ELSE([0-9]+)\*\/\r?\n[ \t]*else/g, function replacer(match, group1) {
            let spacesCount = Number(group1);
            return "}" + " ".repeat(spacesCount) + "else";
        });

        file.contents = Buffer.from(contents, encoding);

        callback(null, file);
    });
}

module.exports = {
    saveWhitespace,
    restoreWhitespace
};
