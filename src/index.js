import Resolver from '@forge/resolver';
import api, { route } from '@forge/api';
const resolver = new Resolver();

async function fetchJiraIssueDetails(issueId) {
  const response = await api.asUser().requestJira(route`/rest/api/3/issue/${issueId}?fields=summary,description,comment`);
  const data = await response.json();
  return {
    summary: data.fields.summary || "No summary provided",
    description: data.fields.description || "No description provided for this ticket",
    comments: data.fields.comment?.comments ? data.fields.comment.comments.map(c => c.body) : [],
  };
}

async function fetchConfluenceSpaces() {
  const response = await api.asUser().requestConfluence(route`/wiki/api/v2/spaces?limit=50`);
  if(!response.ok) {
    const errorText = await response.text();
    console.error("fetchConfluenceSpaces failed:", response.status, errorText);
    throw new Error(`Confluence Spaces Error (${response.status}): ${errorText}`);
  }
  const data = await response.json();
  const spacesList = Array.isArray(data.results) ? data.results : [];
  return spacesList.map(space => ({
    id: space.id,
    key: space.key,
    name: space.name
  }));
}

async function createConfluenceADR(spaceKey, title, adrContent) {
  const spaces = await fetchConfluenceSpaces();
  const targetSpace = spaces.find(
    s => s.key?.toLowerCase() === spaceKey?.toLowerCase()
  );
  if(!targetSpace) {
    const available = spaces.map(s => `${s.key} (${s.name})`).join(', ');
    throw new Error(`Confluence space "${spaceKey}" not found. Available spaces: ${available}`);
  }
  const lookupParams = new URLSearchParams({
    "space-id": String(targetSpace.id),
    title: title,
  });
  const lookupRes = await api.asUser().requestConfluence(
    route`/wiki/api/v2/pages?${lookupParams}`,
    {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    }
  );
  if(!lookupRes.ok) {
    const errorText = await lookupRes.text();
    throw new Error(`Confluence Page Lookup Error (${lookupRes.status}): ${errorText}`);
  }
  const LookupData = await lookupRes.json();
  const existingPage = (LookupData.results || []).find(
    (page) => page.title === title
  );
  let response;
  let actionLabel;
  if(existingPage) {
    //update -- PUT
    const pageRes = await api.asUser().requestConfluence(
      route`/wiki/api/v2/pages/${existingPage.id}`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      }
    );
    if(!pageRes.ok) {
      const errorText = await pageRes.text();
      throw new Error(`Confluence Page Fetch Error (${pageRes.status}): ${errorText}`);
    }
    const pageData = await pageRes.json();
    const currVersion = pageData.version?.number ? pageData.version.number : 1;
    const nextVersion = currVersion + 1;
    const updateBodyData = {
      id: existingPage.id,
      status: 'current',
      title: title,
      spaceId: targetSpace.id,
      body: {
        representation: 'storage',
        value: adrContent
      },
      version: {
        number: nextVersion,
      }
    };
    response = await api.asUser().requestConfluence(route`/wiki/api/v2/pages/${existingPage.id}`, {
      method: 'PUT',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify(updateBodyData)
    });
    actionLabel = "updated";
  }else {
    //Create -- POST
    const bodyData = {
      spaceId: targetSpace.id,
      status: 'current',
      title: title,
      body: {
        representation: 'storage',
        value: adrContent
      }
    };
    response = await api.asUser().requestConfluence(route`/wiki/api/v2/pages`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify(bodyData)
    });
    actionLabel = "created";
  }

  if(!response.ok) {
    const errorText = await response.text();
    throw new Error(`Confluence Publish Error (${response.status}): ${errorText}`);
  }
  
  const data = await response.json();
  return {
    success: true,
    pageId: data.id,
    title: data.title,
    webUrl: data._links?.base && data._links?.webui ? `${data._links.base}${data._links.webui}` : `Page ${actionLabel} with ID : ${data.id}`
  };
  
}
// Door 1: Custom UI Issue Panel Resolvers

resolver.define('getJiraIssueDetails', async (req) => {
  const issueId = req.payload.issueId;
  if(!issueId) {
    throw new Error('Missing issueId in payload');
  }
  return await fetchJiraIssueDetails(issueId);
});

resolver.define('getConfluenceSpaces', async (req) => {
  return await fetchConfluenceSpaces();
});

resolver.define('publishADR', async (req) => {
  const {spaceKey, title, adrContent} = req.payload;
  return await createConfluenceADR(spaceKey, title, adrContent);
});

export const handler = resolver.getDefinitions();

//Door 2: Direct Rovo Agent Action Handlers


export async function getJiraIssueDetails(payload, context) {
  const issueId = payload.issueId || payload.issueKey || context?.extension?.issue?.key;
  return await fetchJiraIssueDetails(issueId);
}

export async function getConfluenceSpaces(payload, context) {
  return await fetchConfluenceSpaces();
}

export async function publishADR(payload, context) {
  const {spaceKey, title, adrContent} = payload;
  return await createConfluenceADR(spaceKey, title, adrContent);
}