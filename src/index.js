import Resolver from '@forge/resolver';
import api, { route } from '@forge/api';
const resolver = new Resolver();

resolver.define('getJiraIssueDetails', async (req) => {
  const issueId = req.payload.issueId;
  const response = await api.asUser.requestJira(route`/rest/api/3/issue/${issueId}?fields=summary,description,comment`);
  const data = await response.json();
  return {
    summary: data.fields.summary || "No summary provided",
    description: data.fields.description || "No description provided for this ticket",
    comments: data.fields.comment?.comments ? data.fields.comment.comments.map(c => c.body) : [],
  };
});

resolver.define('getConflueceSpaces', async (req) => {
  const response = await api.asUser.requestConfluence(route`/wiki/rest/api/space`);
  const data = await response.json();
  return data.results.map(space => ({
    key: space.key,
    name: space.name
  }));
});

resolver.define('publishADR', async (req) => {
  const {spaceKey, title, adrContent} = req.payload;
  const bodyData = {
    type: 'page',
    title: title,
    space: {
      key: spaceKey
    },
    body: {
      Storage: {
        value: adrContent,
        representation: 'storage'
      }
    }
  };
  const response = await api.asUser.requestConfluence(route`/wiki/rest/api/content`, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json' 
    },
    body: JSON.stringify(bodyData)
  });

  const data = await response.json();
  return {
    pageId: data.id,
    webUrl: `${data._links.base}${data._links.webui}`
  };
});
export const handler = resolver.getDefinitions();
