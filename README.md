## everything in the parent repo plus:

#### json markdown hybrid (toJsonMarkdownHybrid)
ex:
```{
  "metadata": {
    "title": "Document Title",
    "lastModified": "08/11/2025"
  },
  "markdownContent": "Hosting Workshops\n - bullet point 1\n - bullet point 2\n\nNext Section\n - more bullets"
}```

#### fixed markdown spacing issue
prev:
```### Some Title


 - bla bla bla```

fixed:
```### Some Title
 - bla bla bla```

#### improved pure markdown formatting
prev:
```---
null
---

bla bla bla some content```

improved:
```The Actual Title of the Doc
Last Edited: 03/06/2021
---

bla bla bla some content```