import isEmpty from 'lodash.isempty';
import { SpacebarsCompiler } from 'meteor/spacebars-compiler';
import { generateBodyJS, generateTemplateJS, generateDynTemplateJS } from './code-generation';
import { throwCompileError } from './throw-compile-error';

export function compileTagsWithSpacebars(tags, hmrAvailable, dynamic = false) {
  var handler = new SpacebarsTagCompiler();

  tags.forEach((tag) => {
    handler.addTagToResults(tag, hmrAvailable, dynamic);
  });

  return handler.getResults();
}


class SpacebarsTagCompiler {
  constructor() {
    this.results = {
      head: '',
      body: '',
      js: '',
      bodyAttrs: {},
      names: []
    };
  }

  getResults() {
    return this.results;
  }

  addTagToResults(tag, hmrAvailable, dynamic = false) {
    this.tag = tag;

    // do we have 1 or more attributes?
    const hasAttribs = !isEmpty(this.tag.attribs);

    if (this.tag.tagName === "head") {
      if (hasAttribs) {
        this.throwCompileError("Attributes on <head> not supported");
      }

      this.results.head += this.tag.contents;
      return;
    }


    // <body> or <template>

    try {
      if (this.tag.tagName === "template") {
        const name = this.tag.attribs.name;

        if (! name) {
          this.throwCompileError("Template has no 'name' attribute");
        }

        if (dynamic && name[0] === '$') {
          this.throwCompileError("Template names beginning with '$' are reserved for system templates");
        }

        if (SpacebarsCompiler.isReservedName(name)) {
          this.throwCompileError(`Template can't be named "${name}"`);
        }

        const whitespace = this.tag.attribs.whitespace || '';

        const renderFuncCode = SpacebarsCompiler.compile(this.tag.contents, {
          whitespace,
          isTemplate: true,
          sourceName: `Template "${name}"`
        });

        this.results.names.push(name);
        this.results.js += dynamic ?
        generateDynTemplateJS(name, renderFuncCode, hmrAvailable) :
        generateTemplateJS(name, renderFuncCode, hmrAvailable);
      } else if (this.tag.tagName === "body") {
        const { whitespace = '', ...attribs } = this.tag.attribs;
        this.addBodyAttrs(attribs);

        const renderFuncCode = SpacebarsCompiler.compile(this.tag.contents, {
          whitespace,
          isBody: true,
          sourceName: "<body>"
        });

        // We may be one of many `<body>` tags.
        this.results.js += generateBodyJS(renderFuncCode, hmrAvailable);
      } else {
        this.throwCompileError("Expected <template>, <head>, or <body> tag in template file", tagStartIndex);
      }
    } catch (e) {
      if (e.scanner) {
        // The error came from Spacebars
        this.throwCompileError(e.message, this.tag.contentsStartIndex + e.offset);
      } else {
        throw e;
      }
    }
  }

  addBodyAttrs(attrs) {
    Object.keys(attrs).forEach((attr) => {
      const val = attrs[attr];

      // This check is for conflicting body attributes in the same file;
      // we check across multiple files in caching-html-compiler using the
      // attributes on results.bodyAttrs
      if (this.results.bodyAttrs.hasOwnProperty(attr) && this.results.bodyAttrs[attr] !== val) {
        this.throwCompileError(
          `<body> declarations have conflicting values for the '${attr}' attribute.`);
      }

      this.results.bodyAttrs[attr] = val;
    });
  }

  throwCompileError(message, overrideIndex) {
    throwCompileError(this.tag, message, overrideIndex);
  }
}
