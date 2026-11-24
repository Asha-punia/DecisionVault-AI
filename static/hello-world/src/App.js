import { useEffect, useState } from "react";
import { view, invoke } from "@forge/bridge";

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
    }catch(e) {
      setError(e?.message || "Failed to load ticket details and Spaces.");
    }finally {
      setLoading(false);
    }
  }
  return (
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
  );
}

export default App;