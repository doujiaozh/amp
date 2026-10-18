const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { CallToolRequestSchema, ListToolsRequestSchema } = require("@modelcontextprotocol/sdk/types.js");

const server = new Server({ name: "amp-memory", version: "0.1.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{
    name: "amp_write_memory",
    description: "Write a memory into AMP with attestation evidence",
    inputSchema: {
      type: "object",
      properties: {
        appId: { type: "string" },
        scope: { type: "string" },
        content: { type: "string" },
        confidence: { type: "number" }
      },
      required: ["appId", "scope", "content", "confidence"]
    }
  }]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "amp_write_memory") {
    const args = request.params.arguments;
    const payload = {
      appId: args.appId,
      scope: args.scope,
      content: args.content,
      attestation: {
        source: "model",
        method: "mcp-tool-call",
        confidence: args.confidence,
        limitations: [],
        capturedAt: Date.now()
      }
    };
    const res = await fetch("http://127.0.0.1:7717/v1/memories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  }
  throw new Error("Tool not found");
});

const transport = new StdioServerTransport();
server.connect(transport).then(() => {
  console.error("AMP MCP Server running on stdio");
});