import { useEffect, useState } from "react";
import { view, invoke, router } from "@forge/bridge";

function extractText(node) {
 if(!node) return "";
 if(typeof node === "string") return node;
 if(Array.isArray(node)) return node.map(extractText).join("");
 if(node.text) return node.text;
 if(node.content) return node.content.map(extractText).join("\n");
 return "";
}

function App() {
  const [issueKey, setIssueKey] = useState("");
  const [ticketData, setTicketData] = useState(null);
  const [spaces, setSpaces] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [selectedSpaceKey, setSelectedSpaceKey] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState(null);
  const [publishError, setPublishError] = useState("");

  useEffect(() => {
    let isMounted = true;
    async function init() {
      try {
        const context = await view.getContext();
        if(!isMounted) return;
        setIssueKey(context?.extension?.issue?.key || "");
      }catch(e) {
        if(!isMounted) return;
        setError(typeof e === "string" ? e : e?.message || "Failed to load jira issue context.");
      }
    }
    init();
    return () => {
      isMounted= false;
    }
  }, []);

  const handleLoad = async () => {
    if(!issueKey) return;
    setError("");
    setLoading(true);
    try {
      const [issueRes, spacesRes] = await Promise.all([
        invoke("getJiraIssueDetails", {issueId: issueKey}),
        invoke("getConfluenceSpaces"),
      ]);
      setTicketData(issueRes || null);
      setSpaces(Array.isArray(spacesRes) ? spacesRes : spacesRes?.results || []);
      setSelectedSpaceKey("");
      setPublishResult(null);
      setPublishError("");
    }catch(e) {
      setError(typeof e === "string" ? e : e?.message || "Failed to load ticket details and Spaces.");
    }finally {
      setLoading(false);
    }
  }

  const escapeXml = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");

  const handlePublish = async () => {
    if (!ticketData || !issueKey || !selectedSpaceKey) return;
    setPublishError("");
    setPublishResult(null);
    setPublishing(true);
    try {
      const summary = extractText(ticketData.summary) || "Untitled Decision";
      const description = extractText(ticketData.description) || "No description provided.";
      const comments = Array.isArray(ticketData.comments) && ticketData.comments.length > 0
        ? `<ul>${ticketData.comments.map((comment, idx) => {
          const author = comment?.author?.displayName || comment?.author || `Comment ${idx + 1}`;
          const bodyText = extractText(comment?.body || comment?.text || comment) || "";
          return `<li><strong>${escapeXml(author)}:</strong> ${escapeXml(bodyText)}</li>`;
        }).join("")}</ul>`
        : "<p>No comments on this ticket yet.</p>";
      const title = `ADR: ${issueKey} - ${summary}`;
      const adrContent = `
        <h2>Decision Context</h2>
        <p><strong>Jira issue:</strong> ${escapeXml(issueKey)}</p>
        <p><strong>Summary:</strong> ${escapeXml(summary)}</p>
        <h2>Problem &amp; Description</h2>
        <p>${escapeXml(description)}</p>
        <h2>Discussion &amp; Comments</h2>
        ${comments}
      `;
      console.log("Publishing payload: ", {spaceKey: selectedSpaceKey, title, adrContent});
      const res = await invoke("publishADR", {
        spaceKey: selectedSpaceKey,
        title,
        adrContent
      });

      if(res?.success) {
        setPublishResult(res);
      }else {
        setPublishError(typeof res?.error === "string" ? res.error : extractText(res?.error) || "Failed to publish ADR to Confluence.");
      }
    } catch (e) {
      setPublishError(typeof e === "string" ? e : e?.message || "Failed to publish ADR to Confluence.");
    }finally {
      setPublishing(false);
    }
  }
  
  return (
    <div>
      <div>
        <h3>DecisionVault AI</h3>

        <p>
          Active Ticket: <strong>{issueKey || "Detecting..."} </strong>
        </p>

        <button onClick={handleLoad} disabled={loading || !issueKey}>
          {loading ? "Loading..." : "Load Ticket & Spaces"}
        </button>

        {error && <p>{error}</p>}

        {ticketData && (
          <div>
            <h4>Summary</h4>
            <p>{ticketData.summary || "No summary available"}</p>

            <h4>Description</h4>
            <p>{extractText(ticketData.description) || "No description provided."}</p>

            <h4>Comments ({Array.isArray(ticketData.comments) ? ticketData.comments.length : 0})</h4>

            {Array.isArray(ticketData.comments) && ticketData.comments.length > 0 ? (
              <div>
                {ticketData.comments.map((comment, idx) => (
                  <div key={comment.id || idx}>
                    <strong>
                      {comment.author?.displayName || comment.author || `comment ${idx + 1}`}:
                    </strong>
                    <p>
                      {extractText(comment.body || comment.text || comment)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p>No comments on this ticket yet.</p>
            )}

            {spaces.length > 0 && (
              <div>
                <h4>
                  Confluence Spaces ({spaces.length})
                </h4>
                <ul>
                  {spaces.map((space) => (
                    <li key={space.id}>
                      {space.name} ({space.key})
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {spaces.length > 0 && (
        <div>
          <label for="confluence-space-select">Target Confluence Space</label>
          <select
            id="confluence-space-select"
            value={selectedSpaceKey}
            onChange={(e) => {
              setSelectedSpaceKey(e.target.value);
              setPublishResult(null);
              setPublishError("");
            }}
          >
            <option value="">-- Select a Confluence Space --</option>
              {spaces.map((space) => (
                <option key={space.id || space.key} value={space.key}>
                  {space.name} ({space.key})
                </option>
              ))}
          </select>
          <button
            type="button"
            disabled={!selectedSpaceKey || !ticketData || publishing}
            onClick={handlePublish}
          >
            {publishing ? "Publishing ADR..." : "Generate & Publish ADR"}
          </button>
          {publishError && (
            <div>
              <p>{publishError}</p>
            </div>
          )}
          {publishResult && (
            <div>
              <p>ADR Published: {publishResult.title}</p>
              {publishResult.webUrl && (
                <a
                  href={publishResult.webUrl} 
                  onClick={(e) => {
                    e.preventDefault();
                    router.open(publishResult.webUrl)
                  }}
                >
                  Open in Confluence
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;