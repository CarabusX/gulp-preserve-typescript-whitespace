import stream = require('stream');

export interface PreserveTypescriptWhitespaceOptions {
    preserveNewLines: boolean;
    preserveMultipleSpaces: boolean;
    preserveSpacesBeforeColons: boolean;
    collapseSpacesBeforeRemovedColons: boolean;
    preserveSameLineElse: boolean;
    showDebugOutput: boolean;
}

export declare function saveWhitespace(options?: Partial<PreserveTypescriptWhitespaceOptions>): stream.Transform;
export declare function restoreWhitespace(): stream.Transform;
