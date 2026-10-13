import { useId, useState } from "react";
import { Check, Copy, ExternalLink, Terminal } from "lucide-react";

const agents = ["Codex", "Claude Code", "Cursor", "Gemini CLI"] as const;
type Agent = (typeof agents)[number];

export function AgentSetup({ endpoint, bundleName, bundleId, download }: {
  endpoint: string;
  bundleName: string;
  bundleId: string;
  download: (name: string, text: string) => void;
}) {
  const [agent, setAgent] = useState<Agent>("Codex");
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");
  const panelId = useId();
  const commands = {
    Codex: `codex mcp add schemaDB --url "${endpoint}"`,
    "Claude Code": `claude mcp add --scope user --transport http schemaDB "${endpoint}"`,
    Cursor: "",
    "Gemini CLI": `gemini mcp add --scope user --transport http schemaDB "${endpoint}"`,
  };
  const config = agent === "Codex"
    ? `[mcp_servers.schemaDB]\nurl = "${endpoint}"`
    : JSON.stringify({ mcpServers: { schemaDB: agent === "Gemini CLI"
      ? { httpUrl: endpoint }
      : agent === "Cursor" ? { url: endpoint } : { type: "http", url: endpoint } } }, null, 2);
  const configPath = { Codex: "~/.codex/config.toml", "Claude Code": ".mcp.json in your project", Cursor: "~/.cursor/mcp.json", "Gemini CLI": "~/.gemini/settings.json" }[agent];
  const cursorLink = `cursor://anysphere.cursor-deeplink/mcp/install?name=schemaDB&config=${encodeURIComponent(btoa(JSON.stringify({ url: endpoint })))}`;
  const prompt = `Use the schemaDB MCP to create a new diagram in the bundle ${JSON.stringify(bundleName)} (bundle_id: ${bundleId}). Use a unique diagram ID, validate the DBML, save it, and read it back to confirm. Return the diagram ID. The schema should include: [describe your tables and relationships]. For object/BLOB, document or key-value storage, read_schema then use write_storage with the latest revision to define stores, buckets/collections/keyspaces, document/value shapes, and connections to SQL columns.`;
  async function copy(value: string, label: string) {
    setError("");
    try { await navigator.clipboard.writeText(value); setCopied(label); }
    catch { setError("Clipboard unavailable. Select and copy the text instead."); }
  }
  return <div className="agent-setup">
    <p className="agent-intro">Connect once. Let your agent create and edit your diagrams.</p>
    <div className="agent-choices" role="group" aria-label="Choose your agent">
      {agents.map(name => <button key={name} type="button" aria-pressed={agent === name} aria-controls={panelId} onClick={() => { setAgent(name); setCopied(""); setError(""); }}>{name}</button>)}
    </div>
    <section id={panelId} className="agent-instructions" aria-label={`${agent} setup`}>
      <div className="agent-step"><Terminal size={15} /><strong>{agent === "Cursor" ? "Add to your editor" : "Run in your terminal"}<span>One-time setup</span></strong></div>
      {agent === "Cursor" ? <>
        <p>Open Cursor and confirm adding schemaDB. Available in the editor and Cursor CLI.</p>
        <a className="agent-install" href={cursorLink}>Add to Cursor <ExternalLink size={14} /></a>
      </> : <>
        <div className="agent-command"><code>{commands[agent]}</code><button type="button" aria-label={`Copy ${agent} command`} onClick={() => void copy(commands[agent], "command")}>{copied === "command" ? <Check size={15} /> : <Copy size={15} />}{copied === "command" ? "Copied" : "Copy"}</button></div>
        <p>Available across your projects. Restart your agent after adding the server.</p>
      </>}
    </section>
    <div className="agent-prompt">
      <div><strong>Then ask your agent</strong><button type="button" aria-label="Copy starter prompt" onClick={() => void copy(prompt, "prompt")}>{copied === "prompt" ? <Check size={14} /> : <Copy size={14} />}{copied === "prompt" ? "Copied" : "Copy prompt"}</button></div>
      <p>{prompt}</p>
    </div>
    <details className="agent-manual">
      <summary>Manual configuration</summary>
      <p>Merge this into <b>{configPath}</b>, preserving your existing servers and settings.</p>
      <pre>{config}</pre>
      <div className="agent-manual-actions"><button type="button" onClick={() => void copy(config, "config")}>{copied === "config" ? <Check size={14} /> : <Copy size={14} />}{copied === "config" ? "Copied" : "Copy config"}</button><button type="button" onClick={() => download(agent === "Codex" ? "schemaDB.mcp.toml" : "schemaDB.mcp.json", config)}>Download config</button></div>
      <p>Streamable HTTP endpoint</p><code className="path">{endpoint}</code>
    </details>
    {error && <p role="alert" className="error">{error}</p>}
    <p className="agent-status" role="status" aria-live="polite">{copied ? `${copied === "command" ? "Setup command" : copied === "prompt" ? "Starter prompt" : "Configuration"} copied to clipboard.` : "No API key needed. Diagrams are public and editable."}</p>
  </div>;
}
