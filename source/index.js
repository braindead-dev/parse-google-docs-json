const { google } = require("googleapis");

const {
  convertGoogleDocumentToJson,
  convertJsonToMarkdown,
} = require("./parser.js");

async function parseGoogleDocs(configuration = {}) {
  const clientEmail =
    configuration.clientEmail || process.env.PARSE_GOOGLE_DOCS_CLIENT_EMAIL;
  const privateKey =
    configuration.privateKey || process.env.PARSE_GOOGLE_DOCS_PRIVATE_KEY;
  const documentId = configuration.documentId;
  const scopes = ["https://www.googleapis.com/auth/documents.readonly"];

  if (!clientEmail) {
    throw new Error('Please, provide "clientEmail" in the constructor');
  }

  if (!privateKey) {
    throw new Error('Please, provide "privateKey" in the constructor');
  }

  if (!documentId) {
    throw new Error('Please, provide "documentId" in the constructor');
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: scopes,
  });

  const docs = google.docs({ version: "v1", auth });

  const docsResponse = await docs.documents.get({
    documentId: documentId,
  });

  function toJson() {
    const jsonDocument = convertGoogleDocumentToJson(docsResponse.data);

    return {
      metadata: { title: docsResponse.data.title },
      ...jsonDocument,
    };
  }

  function toMarkdown() {
    const documentInJson = convertGoogleDocumentToJson(docsResponse.data);
    return convertJsonToMarkdown(documentInJson);
  }

  return {
    toJson,
    toMarkdown,
  };
}

module.exports = parseGoogleDocs;
