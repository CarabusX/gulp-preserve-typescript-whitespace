# gulp-preserve-typescript-whitespace
=====================================

A gulp plugin that preserves empty lines and multiple spaces in source files compiled from TypeScript to JavaScript.

Copyright (c) 2020, Rafał Karczmarczyk

How to install
--------------
##### 1. Install gulp & gulp-typescript
See https://www.npmjs.com/package/gulp and https://www.npmjs.com/package/gulp-typescript.

##### 2. Install gulp-preserve-typescript-whitespace
```shell
npm install gulp-preserve-typescript-whitespace --save-dev
```

Basic Usage
-----------
```js
var gulp = require('gulp');
var ts = require("gulp-typescript");
var preserveWhitespace = require('gulp-preserve-typescript-whitespace');

gulp.task("compile-ts", function () {
    return gulp.src('src/**/*.ts')
        .pipe(preserveWhitespace.saveWhitespace())    // Encodes whitespaces/newlines so TypeScript compiler won't remove them
        .pipe(ts({ removeComments: false }))          // TypeScript compiler must be run with "removeComments: false" option
        .js
        .pipe(preserveWhitespace.restoreWhitespace()) // Restores encoded whitespaces/newlines
        .pipe(gulp.dest("dist"));
});
```

Options
-------
```js
        .pipe(preserveWhitespace.saveWhitespace({
            preserveNewLines: true,
            preserveMultipleSpaces: true,
            preserveSpacesBeforeColons: true,
            collapseSpacesBeforeRemovedColons: true,
            preserveSameLineElse: true
        }))
```
- `preserveNewLines` - Preserve extra empty lines.
- `preserveMultipleSpaces` - Preserve multiple consecutive spaces inside lines (but ignores leading whitespace/indentation).
- `preserveSpacesBeforeColons` - Preserve single and multiple spaces before colons (:). Keep in mind that colons with types after them will get removed when compiling TypeScript into JavaScript, so preserving any spaces before colons might be undesired in some cases. Defaults to value of `preserveMultipleSpaces` option.
- `collapseSpacesBeforeRemovedColons` - Remove preserved whitespace before colons (:), if the colons themselves were removed during compilation. Only has effect if `preserveSpacesBeforeColons` option is set to true.
- `preserveSameLineElse` - Keep one-line "} else" in one line (but has no effect on "else" that already was in the next line before compilation).

All above options default to *true*.

How it works?
-------------
It takes advantage of the fact that TypeScript compiler, while not preserving newlines and spaces, preserves *COMMENTS*.

The basic idea came from this [ post ](https://github.com/microsoft/TypeScript/issues/843#issuecomment-625530359) by Matt Broadstone.
I expanded upon the idea to also preserve multiple consecutive spaces, made sure it correctly handles existing strings and comments (this includes dynamic generation of comment tags, so they never conflict with existing comments), and generally improved its behaviour in border ceses.

Example results
---------------
For this TypeScript file:
```ts
var variableName     = 1;
var longVariableName = 2;

function foo (x: number) {
    if (x === 1) {
        variableName += longVariableName;

        return "yes";
    } else {
        return "no";
    }
}
```

Compiler will normally output JS file without extra newlines or spaces:
```js
var variableName = 1;
var longVariableName = 2;
function foo(x) {
    if (x === 1) {
        variableName += longVariableName;
        return "yes";
    }
    else {
        return "no";
    }
}
```

*gulp-preserve-typescript-whitespace* lets you preserve extra newlines and spaces.
```js
var variableName     = 1;
var longVariableName = 2;

function foo(x) {
    if (x === 1) {
        variableName += longVariableName;

        return "yes";
    } else {
        return "no";
    }
}
```
Also keeps one-line "} else" in one line. :)
