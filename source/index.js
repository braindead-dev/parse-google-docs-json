const { google } = require("googleapis");

const {
  convertGoogleDocumentToJson,
  convertJsonToMarkdown,
  convertToJsonMarkdownHybrid,
} = require("./parser.js");

async function parseGoogleDocs(configuration = {}) {
  const clientEmail =
    configuration.clientEmail || process.env.PARSE_GOOGLE_DOCS_CLIENT_EMAIL;
  const privateKey =
    configuration.privateKey || process.env.PARSE_GOOGLE_DOCS_PRIVATE_KEY;
  const documentId = configuration.documentId;
  const scopes = ["https://www.googleapis.com/auth/documents.readonly", "https://www.googleapis.com/auth/drive.readonly"];

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
  const drive = google.drive({ version: "v3", auth });

  const docsResponse = await docs.documents.get({
    documentId: documentId,
  });

  // Get file metadata from Drive API for modification date
  const driveResponse = await drive.files.get({
    fileId: documentId,
    fields: "modifiedTime",
  });

  function toJson() {
    const jsonDocument = convertGoogleDocumentToJson(docsResponse.data);
    
    // Format the modification date
    const modifiedDate = driveResponse.data.modifiedTime 
      ? new Date(driveResponse.data.modifiedTime).toLocaleDateString('en-US', {
          month: '2-digit',
          day: '2-digit', 
          year: 'numeric'
        })
      : null;

    return {
      metadata: { 
        title: docsResponse.data.title,
        lastModified: modifiedDate
      },
      ...jsonDocument,
    };
  }

  function toMarkdown() {
    const documentInJson = convertGoogleDocumentToJson(docsResponse.data);
    
    // Format the modification date
    const modifiedDate = driveResponse.data.modifiedTime 
      ? new Date(driveResponse.data.modifiedTime).toLocaleDateString('en-US', {
          month: '2-digit',
          day: '2-digit', 
          year: 'numeric'
        })
      : null;
    
    return convertJsonToMarkdown({
      metadata: { 
        title: docsResponse.data.title,
        lastModified: modifiedDate
      },
      ...documentInJson,
    });
  }

  function toJsonMarkdownHybrid() {
    const documentInJson = convertGoogleDocumentToJson(docsResponse.data);
    
    // Format the modification date
    const modifiedDate = driveResponse.data.modifiedTime 
      ? new Date(driveResponse.data.modifiedTime).toLocaleDateString('en-US', {
          month: '2-digit',
          day: '2-digit', 
          year: 'numeric'
        })
      : null;
    
    return convertToJsonMarkdownHybrid({
      metadata: { 
        title: docsResponse.data.title,
        lastModified: modifiedDate
      },
      ...documentInJson,
    });
  }

  return {
    toJson,
    toMarkdown,
    toJsonMarkdownHybrid,
  };
}

module.exports = parseGoogleDocs;