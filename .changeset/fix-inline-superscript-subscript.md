---
"emdash": patch
---

Preserve superscript and subscript marks in the in-page visual editor

`InlinePortableTextEditor` now registers TipTap's Superscript and Subscript mark extensions and maps the `superscript` and `subscript` Portable Text decorators through the ProseMirror round-trip. The inline bubble menu adds Superscript and Subscript toggle buttons so the marks are discoverable without a keyboard shortcut. When the mark-safety assertions block a load or save because of an unsupported mark, the editor now shows an inline error message instead of going blank or logging only to the console.
