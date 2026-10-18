const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");

async function main() {
  console.log("1. 正在向 AMP 守护进程申请授权...");
  const res = await fetch("http://127.0.0.1:7717/v1/grants", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ appId: "app-a", scopes: ["work"], ttlMs: 600000 })
  });
  console.log("  授权请求状态:", res.status);

  console.log("2. 正在启动 MCP Server 并连接...");
  const transport = new StdioClientTransport({
    command: "node",
    args: ["reference/mcp-server.js"],
    env: { ...process.env, NODE_SKIP_PLATFORM_CHECK: "1" }
  });

  const client = new Client({ name: "test-client", version: "1.0.0" }, { capabilities: {} });

  try {
    await client.connect(transport);
    console.log("✅ 成功连接到 MCP Server!");
  } catch (e) {
    console.error("  MCP 连接失败:", e); return;
  }

  console.log("3. 正在请求 MCP 工具列表...");
  const tools = await client.listTools();
  console.log("🛠️ 发现的工具:", tools.tools.map(t => t.name));

  console.log("\n4. 模拟 AI 正在调用 amp_write_memory...");
  try {
    const result = await client.callTool({
      name: "amp_write_memory",
      arguments: { appId: "app-a", scope: "work", content: "Cursor 通过 MCP 调用了 AMP，存入了这条绝密记忆！", confidence: 0.99 }
    });
    console.log("✅ 调用结果:", result.content[0].text);
    console.log("\n🎉 MCP 测试圆满成功！快去刷新你的 Web UI 面板看看！");
  } catch (e) {
    console.error("  工具调用失败:", e);
  }
  process.exit(0);
}

main().catch(e => console.error("主函数报错:", e));