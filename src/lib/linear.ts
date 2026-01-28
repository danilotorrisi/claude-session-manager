import type { LinearIssue } from "../types";

const LINEAR_API_URL = "https://api.linear.app/graphql";

export async function searchIssues(
  query: string,
  apiKey: string
): Promise<LinearIssue[]> {
  const graphqlQuery = {
    query: `
      query SearchIssues($term: String!) {
        searchIssues(term: $term, first: 10) {
          nodes {
            id
            identifier
            title
            url
            description
            priority
            state {
              name
            }
          }
        }
      }
    `,
    variables: { term: query },
  };

  const response = await fetch(LINEAR_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey,
    },
    body: JSON.stringify(graphqlQuery),
  });

  if (!response.ok) {
    throw new Error(`Linear API error: ${response.status}`);
  }

  const data = await response.json();
  const nodes = data?.data?.searchIssues?.nodes;

  if (!Array.isArray(nodes)) {
    return [];
  }

  return nodes.map((node: any) => ({
    id: node.id,
    identifier: node.identifier,
    title: node.title,
    url: node.url,
    description: node.description || undefined,
    state: node.state?.name || undefined,
    priority: node.priority ?? undefined,
  }));
}

export async function listMyIssues(
  apiKey: string
): Promise<LinearIssue[]> {
  const graphqlQuery = {
    query: `
      query MyIssues {
        viewer {
          assignedIssues(
            first: 10,
            filter: {
              state: { type: { nin: ["completed", "canceled"] } }
            },
            orderBy: updatedAt
          ) {
            nodes {
              id
              identifier
              title
              url
              description
              priority
              state {
                name
              }
            }
          }
        }
      }
    `,
  };

  const response = await fetch(LINEAR_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey,
    },
    body: JSON.stringify(graphqlQuery),
  });

  if (!response.ok) {
    throw new Error(`Linear API error: ${response.status}`);
  }

  const data = await response.json();
  const nodes = data?.data?.viewer?.assignedIssues?.nodes;

  if (!Array.isArray(nodes)) {
    return [];
  }

  return nodes.map((node: any) => ({
    id: node.id,
    identifier: node.identifier,
    title: node.title,
    url: node.url,
    description: node.description || undefined,
    state: node.state?.name || undefined,
    priority: node.priority ?? undefined,
  }));
}
