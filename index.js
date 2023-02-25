import {
  AzureKeyCredential,
  TextAnalysisClient,
} from "@azure/ai-language-text";

import cors from "cors";
import { DocumentAnalysisClient } from "@azure/ai-form-recognizer";
import express from "express";
const app = express();

app.use(express.json());
app.use(cors());

const port = 3000;

// Summarize API
const endpoint =
  process.env["ENDPOINT"] ||
  "https://ntu-hackathon.cognitiveservices.azure.com/";
const apiKey =
  process.env["LANGUAGE_API_KEY"] || "ce91393f4d6e4710a26b710142e60ec6";

// PDF to text API
const PDFkey = "da713630eb414baba83ef591cd5ab441";
const PDFendpoint = "https://ntu-form-recognizer.cognitiveservices.azure.com/";

// helper functions
function* getTextOfSpans(content, spans) {
  for (const span of spans) {
    yield content.slice(span.offset, span.offset + span.length);
  }
}

// POST request to summarize document
app.post("/summarize", (req, res) => {
  const documents = req.body.documents;
  async function summarize() {
    var summary = "";
    var allPhrases = [];
    var entityLinking = [];
    var namedEntites = [];
    console.log(req.body.documents);
    console.log("== Extractive Summarization Sample ==");

    const client = new TextAnalysisClient(
      endpoint,
      new AzureKeyCredential(apiKey)
    );
    const actions = [
      {
        kind: "ExtractiveSummarization",
        maxSentenceCount: 2,
      },
    ];
    const poller = await client.beginAnalyzeBatch(actions, documents, "en");

    poller.onProgress(() => {
      console.log(
        `Last time the operation was updated was on: ${
          poller.getOperationState().modifiedOn
        }`
      );
    });
    console.log(
      `The operation was created on ${poller.getOperationState().createdOn}`
    );
    console.log(
      `The operation results will expire on ${
        poller.getOperationState().expiresOn
      }`
    );

    const results = await poller.pollUntilDone();

    for await (const actionResult of results) {
      if (actionResult.kind !== "ExtractiveSummarization") {
        throw new Error(
          `Expected extractive summarization results but got: ${actionResult.kind}`
        );
      }
      if (actionResult.error) {
        const { code, message } = actionResult.error;
        throw new Error(`Unexpected error (${code}): ${message}`);
      }
      for (const result of actionResult.results) {
        console.log(`- Document ${result.id}`);
        summary = result.sentences.map((sentence) => sentence.text).join("\n");
        if (result.error) {
          const { code, message } = result.error;
          throw new Error(`Unexpected error (${code}): ${message}`);
        }

        // This is a mess but gg
        // I wanna do key phrase extraction here

        const kpresults = await client.analyze(
          "KeyPhraseExtraction",
          documents
        );

        for (const result of kpresults) {
          console.log(`- Document ${result.id}`);
          if (!result.error) {
            console.log("\tKey phrases:");
            for (const phrase of result.keyPhrases) {
              console.log(`\t- ${phrase}`);
              allPhrases.push(phrase);
            }
          } else {
            console.error("  Error:", result.error);
          }
        }

        // I wanna do wikipedia links
        const entityResults = await client.analyze("EntityLinking", documents);

        console.log("== Entity linking sample ==");

        for (const result of entityResults) {
          console.log(`- Document ${result.id}`);
          if (!result.error) {
            console.log("\tEntities:");
            entityLinking = result.entities;
            for (const entity of result.entities) {
              console.log(
                `\t- Entity ${entity.name}; link ${entity.url}; datasource: ${entity.dataSource}`
              );
              console.log("\t\tMatches:");
              for (const match of entity.matches) {
                console.log(
                  `\t\t- Entity appears as "${match.text}" (confidence: ${match.confidenceScore}`
                );
              }
            }
          } else {
            console.error("  Error:", result.error);
          }
        }

        // I wanna do namedEntites
        const namedEntitiesresults = await client.analyze(
          "EntityRecognition",
          documents
        );

        for (const result of namedEntitiesresults) {
          console.log(`- Document ${result.id}`);
          if (!result.error) {
            console.log("\tRecognized Entities:");
            for (const entity of result.entities) {
              namedEntites = result.entities;
              console.log(
                `\t- Entity ${entity.text} of type ${entity.category}`
              );
            }
          } else console.error("\tError:", result.error);
        }

        res.status(200).json({
          summary: summary,
          keyPhrases: allPhrases,
          entityLinking: entityLinking,
          namedEntites: namedEntites,
        });
      }
    }
  }

  summarize().catch((err) => {
    console.error("The sample encountered an error:", err);
  });
});
// POST request to convert PDF to text
app.post("/pdf-to-text", (req, res) => {
  const documentUrlRead = req.body.url;

  async function pdfToText() {
    // create your `DocumentAnalysisClient` instance and `AzurePDFkeyCredential` variable
    const client = new DocumentAnalysisClient(
      PDFendpoint,
      new AzureKeyCredential(PDFkey)
    );
    const poller = await client.beginAnalyzeDocument(
      "prebuilt-read",
      documentUrlRead
    );

    const { content, pages, languages, styles } = await poller.pollUntilDone();

    if (pages.length <= 0) {
      console.log("No pages were extracted from the document.");
    } else {
      console.log("Pages:");
      for (const page of pages) {
        console.log("- Page", page.pageNumber, `(unit: ${page.unit})`);
        console.log(`  ${page.width}x${page.height}, angle: ${page.angle}`);
        console.log(`  ${page.lines.length} lines, ${page.words.length} words`);

        if (page.lines.length > 0) {
          console.log("  Lines:");
          var result = "";

          for (const line of page.lines) {
            result += line.content;
            console.log(`${line.content}"`);
          }
          res.status(200).json({
            msg: result,
          });
        }
      }
    }
  }
  pdfToText();
});

// Run in PORT 3000
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
