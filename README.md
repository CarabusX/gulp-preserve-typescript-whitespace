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
