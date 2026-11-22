import { useEffect, useState } from "react";
import { view, invoke } from "@forge/bridge";

function App() {
  const [issueKey, setIssueKey] = useState("");;
  const [ticketData, setTicketData] = useState(null);
  const [spaces, setSpaces] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function init() {
      try {
        const context = await view.getContext();
        setIssueKey(context?.extension?.issue?.key || "MC-8");
      }catch(e) {
        console.log("Failed to fetch issueKey", e);
        setIssueKey("MC-8");
      }
    }
    init();
  }, []);
  
  const handleLoad = async () => {
    setError("");
    setLoading(true);
    try {
      const issueObj = await invoke("getJiraIssueDetails", {issueId: issueKey});
      const spaces = await invoke("getConfluenceSpaces");
      setTicketData(issueObj);
      setSpaces(Array.isArray(spaces) ? spaces : []);
    }catch(e) {
      console.log("handle load failed!", e);
      setError(e);
    }finally {
      setLoading(false);
    }
  }
  return (
    <div>
      <h3>DecisionVault AI</h3>
      <p>Active Ticket: <strong>{issueKey || "Loading..."} </strong></p>
      <button onClick={handleLoad} disabled={loading}>{disabled ? "Loading..." : "Load Ticket & Spaces"}</button>
      {error && <p>error?.message || String(error)</p>}
      {ticketData && <>
        <h3>Summary:</h3>
        <p>{ticketData.summary}</p>
        <h3>Description</h3>
        <p>{ticketData.description}</p>
        <h4>Comments: <strong>{ticketData.comments.length}</strong></h4>
      </>}
      {spaces && spaces.map(space => {
        <div key={space.key || space.id}>
          Space: <p>{space.name}</p>
          SpaceKey: <p>{space.key}</p>
        </div>
      })}
    </div>
  );
}

export default App;