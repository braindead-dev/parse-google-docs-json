const json2md = require("json2md");
const YAML = require("yamljs");
const _last = require("lodash.last");
const _get = require("lodash.get");
const _repeat = require("lodash.repeat");

function getParagraphTag(p) {
  const tags = {
    NORMAL_TEXT: "p",
    SUBTITLE: "blockquote",
    HEADING_1: "h1",
    HEADING_2: "h2",
    HEADING_3: "h3",
    HEADING_4: "h4",
    HEADING_5: "h5",
  };

  return tags[p.paragraphStyle.namedStyleType];
}

function getListTag(list) {
  const glyphType = _get(list, [
    "listProperties",
    "nestingLevels",
    0,
    "glyphType",
  ]);
  return glyphType !== undefined ? "ol" : "ul";
}

function cleanText(text) {
  return text.replace(/\n/g, "").trim();
}

function getNestedListIndent(level, listTag) {
  const indentType = listTag === "ol" ? "1." : "-";
  return `${_repeat("  ", level)}${indentType} `;
}

function getTextFromParagraph(p) {
  return p.elements
    ? p.elements
        .filter((el) => el.textRun && el.textRun.content !== "\n")
        .map((el) => (el.textRun ? getText(el) : ""))
        .join("")
    : "";
}

function getTableCellContent(content) {
  if (!content.length === 0) return "";
  return content
    .map(({ paragraph }) => cleanText(getTextFromParagraph(paragraph)))
    .join("");
}

function getImage(document, element) {
  const { inlineObjects } = document;

  if (!inlineObjects || !element.inlineObjectElement) {
    return null;
  }

  const inlineObject =
    inlineObjects[element.inlineObjectElement.inlineObjectId];
  const embeddedObject = inlineObject.inlineObjectProperties.embeddedObject;

  if (embeddedObject && embeddedObject.imageProperties) {
    return {
      source: embeddedObject.imageProperties.contentUri,
      title: embeddedObject.title || "",
      alt: embeddedObject.description || "",
    };
  }

  return null;
}

function getBulletContent(document, element) {
  if (element.inlineObjectElement) {
    const image = getImage(document, element);
    return `![${image.alt}](${image.source} "${image.title}")`;
  }

  return getText(element);
}

function getText(element, { isHeader = false } = {}) {
  let text = cleanText(element.textRun.content);
  const {
    link,
    underline,
    strikethrough,
    bold,
    italic,
  } = element.textRun.textStyle;

  text = text.replace(/\*/g, "\\*");
  text = text.replace(/_/g, "\\_");

  if (underline) {
    // Underline isn't supported in markdown so we'll use emphasis
    text = `_${text}_`;
  }

  if (italic) {
    text = `_${text}_`;
  }

  // Set bold unless it's a header
  if (bold & !isHeader) {
    text = `**${text}**`;
  }

  if (strikethrough) {
    text = `~~${text}~~`;
  }

  if (link) {
    return `[${text}](${link.url})`;
  }

  return text;
}

function getCover(document) {
  const { headers, documentStyle } = document;

  if (
    !documentStyle ||
    !documentStyle.firstPageHeaderId ||
    !headers[documentStyle.firstPageHeaderId]
  ) {
    return null;
  }

  const headerElement = _get(headers[documentStyle.firstPageHeaderId], [
    "content",
    0,
    "paragraph",
    "elements",
    0,
  ]);

  const image = getImage(document, headerElement);

  return image
    ? {
        image: image.source,
        title: image.title,
        alt: image.alt,
      }
    : null;
}

function convertGoogleDocumentToJson(document) {
  const { body, footnotes = {} } = document;
  const cover = getCover(document);

  const content = [];
  const footnoteIDs = {};

  body.content.forEach(({ paragraph, table }, i) => {
    // Paragraphs
    if (paragraph) {
      const tag = getParagraphTag(paragraph);

      // Lists
      if (paragraph.bullet) {
        const listId = paragraph.bullet.listId;
        const list = document.lists[listId];
        const listTag = getListTag(list);

        const bulletContent = paragraph.elements
          .map((el) => getBulletContent(document, el))
          .join(" ")
          .replace(" .", ".")
          .replace(" ,", ",");

        const prev = body.content[i - 1];
        const prevListId = _get(prev, "paragraph.bullet.listId");

        if (prevListId === listId) {
          const list = _last(content)[listTag];
          const { nestingLevel } = paragraph.bullet;

          if (nestingLevel !== undefined) {
            // mimic nested lists
            const lastIndex = list.length - 1;
            const indent = getNestedListIndent(nestingLevel, listTag);

            list[lastIndex] += `\n${indent} ${bulletContent}`;
          } else {
            list.push(bulletContent);
          }
        } else {
          content.push({
            [listTag]: [bulletContent],
          });
        }
      }

      // Headings, Images, Texts
      else if (tag) {
        let tagContent = [];

        paragraph.elements.forEach((el) => {
          // EmbeddedObject
          if (el.inlineObjectElement) {
            const image = getImage(document, el);

            if (image) {
              tagContent.push({
                img: image,
              });
            }
          }

          // Headings, Texts
          else if (el.textRun && el.textRun.content !== "\n") {
            tagContent.push({
              [tag]: getText(el, {
                isHeader: tag !== "p",
              }),
            });
          }

          // Footnotes
          else if (el.footnoteReference) {
            tagContent.push({
              [tag]: `[^${el.footnoteReference.footnoteNumber}]`,
            });
            footnoteIDs[el.footnoteReference.footnoteId] =
              el.footnoteReference.footnoteNumber;
          }
        });

        if (tagContent.every((el) => el[tag] !== undefined)) {
          content.push({
            [tag]: tagContent
              .map((el) => el[tag])
              .join(" ")
              .replace(" .", ".")
              .replace(" ,", ","),
          });
        } else {
          content.push(...tagContent);
        }
      }
    }

    // Table
    else if (table && table.tableRows.length > 0) {
      const [thead, ...tbody] = table.tableRows;
      content.push({
        table: {
          headers: thead.tableCells.map(({ content }) =>
            getTableCellContent(content)
          ),
          rows: tbody.map((row) =>
            row.tableCells.map(({ content }) => getTableCellContent(content))
          ),
        },
      });
    }
  });

  // Footnotes reference section (end of document)
  let formatedFootnotes = [];
  Object.entries(footnotes).forEach(([, value]) => {
    // Concatenate all content
    const text_items = value.content[0].paragraph.elements.map((element) =>
      getText(element)
    );
    const text = text_items.join(" ").replace(" .", ".").replace(" ,", ",");

    formatedFootnotes.push({
      footnote: { number: footnoteIDs[value.footnoteId], text: text },
    });
  });
  formatedFootnotes.sort(
    (item1, item2) =>
      parseInt(item1.footnote.number) - parseInt(item2.footnote.number)
  );
  content.push(...formatedFootnotes);
  return {
    cover,
    content,
  };
}

// Add extra converter for footnotes
json2md.converters.footnote = function (footnote) {
  return `[^${footnote.number}]: ${footnote.text}`;
};

function convertJsonToMarkdown({ content, metadata }) {
  // Custom markdown conversion for cleaner output
  let markdown = '';
  
  // Add title and last modified date
  if (metadata && metadata.title) {
    markdown += `${metadata.title}\n`;
    if (metadata.lastModified) {
      markdown += `Last Edited: ${metadata.lastModified}\n`;
    }
    markdown += `---\n\n`;
  }
  
  // Process content with custom formatting
  for (let i = 0; i < content.length; i++) {
    const item = content[i];
    
    // Skip empty paragraphs
    if (item.p === "" || item.p === null) {
      continue;
    }
    
    // Handle headings
    if (item.h1) {
      markdown += `# ${item.h1}\n\n`;
    } else if (item.h2) {
      markdown += `## ${item.h2}\n\n`;
    } else if (item.h3) {
      markdown += `### ${item.h3}\n\n`;
    } else if (item.h4) {
      markdown += `#### ${item.h4}\n\n`;
    } else if (item.h5) {
      markdown += `##### ${item.h5}\n\n`;
    } else if (item.p) {
      // Check if next item is a list - if so, don't add extra spacing
      const nextItem = content[i + 1];
      if (nextItem && (nextItem.ul || nextItem.ol)) {
        markdown += `${item.p}\n`;
      } else {
        markdown += `${item.p}\n\n`;
      }
    } else if (item.ul) {
      // Handle unordered lists
      item.ul.forEach(listItem => {
        markdown += ` - ${listItem}\n`;
      });
      markdown += '\n';
    } else if (item.ol) {
      // Handle ordered lists
      item.ol.forEach((listItem, index) => {
        markdown += `${index + 1}. ${listItem}\n`;
      });
      markdown += '\n';
    } else if (item.blockquote) {
      markdown += `> ${item.blockquote}\n\n`;
    } else if (item.img) {
      markdown += `![${item.img.alt}](${item.img.source} "${item.img.title}")\n\n`;
    } else if (item.table) {
      // Handle tables
      const headers = item.table.headers.join(' | ');
      const separator = item.table.headers.map(() => '---').join(' | ');
      markdown += `| ${headers} |\n| ${separator} |\n`;
      
      item.table.rows.forEach(row => {
        markdown += `| ${row.join(' | ')} |\n`;
      });
      markdown += '\n';
    } else if (item.footnote) {
      markdown += `[^${item.footnote.number}]: ${item.footnote.text}\n`;
    }
  }
  
  return markdown.trim();
}

function convertToJsonMarkdownHybrid({ content, metadata }) {
  // Create markdown content without the title/date header
  let markdownContent = '';
  
  // Process content with custom formatting (same as convertJsonToMarkdown but without header)
  for (let i = 0; i < content.length; i++) {
    const item = content[i];
    
    // Skip empty paragraphs
    if (item.p === "" || item.p === null) {
      continue;
    }
    
    // Handle headings
    if (item.h1) {
      markdownContent += `# ${item.h1}\n\n`;
    } else if (item.h2) {
      markdownContent += `## ${item.h2}\n\n`;
    } else if (item.h3) {
      markdownContent += `### ${item.h3}\n\n`;
    } else if (item.h4) {
      markdownContent += `#### ${item.h4}\n\n`;
    } else if (item.h5) {
      markdownContent += `##### ${item.h5}\n\n`;
    } else if (item.p) {
      // Check if next item is a list - if so, don't add extra spacing
      const nextItem = content[i + 1];
      if (nextItem && (nextItem.ul || nextItem.ol)) {
        markdownContent += `${item.p}\n`;
      } else {
        markdownContent += `${item.p}\n\n`;
      }
    } else if (item.ul) {
      // Handle unordered lists
      item.ul.forEach(listItem => {
        markdownContent += ` - ${listItem}\n`;
      });
      markdownContent += '\n';
    } else if (item.ol) {
      // Handle ordered lists
      item.ol.forEach((listItem, index) => {
        markdownContent += `${index + 1}. ${listItem}\n`;
      });
      markdownContent += '\n';
    } else if (item.blockquote) {
      markdownContent += `> ${item.blockquote}\n\n`;
    } else if (item.img) {
      markdownContent += `![${item.img.alt}](${item.img.source} "${item.img.title}")\n\n`;
    } else if (item.table) {
      // Handle tables
      const headers = item.table.headers.join(' | ');
      const separator = item.table.headers.map(() => '---').join(' | ');
      markdownContent += `| ${headers} |\n| ${separator} |\n`;
      
      item.table.rows.forEach(row => {
        markdownContent += `| ${row.join(' | ')} |\n`;
      });
      markdownContent += '\n';
    } else if (item.footnote) {
      markdownContent += `[^${item.footnote.number}]: ${item.footnote.text}\n`;
    }
  }
  
  // Return JSON structure with metadata and markdown content
  return {
    metadata: metadata || {},
    markdownContent: markdownContent.trim()
  };
}

module.exports = { convertGoogleDocumentToJson, convertJsonToMarkdown, convertToJsonMarkdownHybrid };