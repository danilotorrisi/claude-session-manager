import type { LinearIssue } from "../types";

const LINEAR_API_URL = "https://api.linear.app/graphql";

export interface LinearTeam {
  id: string;
  name: string;
}

export interface LinearLabel {
  id: string;
  name: string;
  color: string;
}

export async function fetchTeams(apiKey: string): Promise<LinearTeam[]> {
  const graphqlQuery = {
    query: `
      query MyTeams {
        viewer {
          teamMemberships {
            nodes {
              team {
                id
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

  const data = await response.json();

  if (!response.ok) {
    const msg = data?.errors?.[0]?.message || `HTTP ${response.status}`;
    throw new Error(`Linear API error: ${msg}`);
  }

  if (data?.errors?.length) {
    throw new Error(data.errors[0].message || "GraphQL error");
  }

  const nodes = data?.data?.viewer?.teamMemberships?.nodes;

  if (!Array.isArray(nodes)) {
    return [];
  }

  return nodes.map((node: any) => ({
    id: node.team.id,
    name: node.team.name,
  }));
}

export async function fetchLabels(apiKey: string, teamId: string): Promise<LinearLabel[]> {
  const graphqlQuery = {
    query: `
      query TeamLabels($teamId: ID!) {
        issueLabels(
          filter: { team: { id: { eq: $teamId } } }
          first: 100
        ) {
          nodes {
            id
            name
            color
          }
        }
      }
    `,
    variables: { teamId },
  };

  const response = await fetch(LINEAR_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey,
    },
    body: JSON.stringify(graphqlQuery),
  });

  const data = await response.json();

  if (!response.ok) {
    const msg = data?.errors?.[0]?.message || `HTTP ${response.status}`;
    throw new Error(`Linear API error: ${msg}`);
  }

  if (data?.errors?.length) {
    throw new Error(data.errors[0].message || "GraphQL error");
  }

  const nodes = data?.data?.issueLabels?.nodes;

  if (!Array.isArray(nodes)) {
    return [];
  }

  return nodes.map((node: any) => ({
    id: node.id,
    name: node.name,
    color: node.color,
  }));
}

export interface CreateIssueInput {
  title: string;
  description?: string;
  teamId: string;
  priority?: number;
  stateId?: string;
  labelIds?: string[];
}

export interface CreateIssueResult {
  id: string;
  identifier: string;
  url: string;
}

export async function createIssue(apiKey: string, input: CreateIssueInput): Promise<CreateIssueResult> {
  const graphqlQuery = {
    query: `
      mutation CreateIssue($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue {
            id
            identifier
            url
          }
        }
      }
    `,
    variables: {
      input: {
        title: input.title,
        ...(input.description && { description: input.description }),
        teamId: input.teamId,
        ...(input.priority !== undefined && input.priority > 0 && { priority: input.priority }),
        ...(input.stateId && { stateId: input.stateId }),
        ...(input.labelIds && input.labelIds.length > 0 && { labelIds: input.labelIds }),
      },
    },
  };

  const response = await fetch(LINEAR_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey,
    },
    body: JSON.stringify(graphqlQuery),
  });

  const data = await response.json();

  if (!response.ok) {
    const msg = data?.errors?.[0]?.message || `HTTP ${response.status}`;
    throw new Error(`Linear API error: ${msg}`);
  }

  if (data?.errors?.length) {
    throw new Error(data.errors[0].message || "GraphQL error");
  }

  const result = data?.data?.issueCreate;
  if (!result?.success || !result?.issue) {
    throw new Error("Failed to create issue");
  }

  return {
    id: result.issue.id,
    identifier: result.issue.identifier,
    url: result.issue.url,
  };
}

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

export interface ListAllMyIssuesResult {
  issues: LinearIssue[];
  hasNextPage: boolean;
  endCursor: string | null;
}

export async function listAllMyIssues(
  apiKey: string,
  cursor?: string
): Promise<ListAllMyIssuesResult> {
  const graphqlQuery = {
    query: `
      query AllMyIssues($cursor: String) {
        viewer {
          assignedIssues(
            first: 50,
            after: $cursor,
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
                id
                name
                type
              }
              team {
                id
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      }
    `,
    variables: { cursor: cursor || null },
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
  const assignedIssues = data?.data?.viewer?.assignedIssues;
  const nodes = assignedIssues?.nodes;
  const pageInfo = assignedIssues?.pageInfo;

  if (!Array.isArray(nodes)) {
    return { issues: [], hasNextPage: false, endCursor: null };
  }

  const issues: LinearIssue[] = nodes.map((node: any) => ({
    id: node.id,
    identifier: node.identifier,
    title: node.title,
    url: node.url,
    description: node.description || undefined,
    state: node.state?.name || undefined,
    stateType: node.state?.type || undefined,
    stateId: node.state?.id || undefined,
    teamId: node.team?.id || undefined,
    priority: node.priority ?? undefined,
  }));

  return {
    issues,
    hasNextPage: pageInfo?.hasNextPage ?? false,
    endCursor: pageInfo?.endCursor ?? null,
  };
}

export interface WorkflowState {
  id: string;
  name: string;
  type: string;
  position: number;
}

export async function fetchWorkflowStates(
  apiKey: string,
  teamId: string
): Promise<WorkflowState[]> {
  const graphqlQuery = {
    query: `
      query WorkflowStates($teamId: ID!) {
        workflowStates(filter: { team: { id: { eq: $teamId } } }) {
          nodes {
            id
            name
            type
            position
          }
        }
      }
    `,
    variables: { teamId },
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

  if (data?.errors?.length) {
    throw new Error(data.errors[0].message || "GraphQL error");
  }

  const nodes = data?.data?.workflowStates?.nodes;

  if (!Array.isArray(nodes)) {
    return [];
  }

  const typeOrder: Record<string, number> = {
    backlog: 0,
    unstarted: 1,
    started: 2,
    completed: 3,
    canceled: 4,
  };

  return nodes
    .map((node: any) => ({
      id: node.id,
      name: node.name,
      type: node.type,
      position: node.position,
    }))
    .sort((a: WorkflowState, b: WorkflowState) => {
      const aType = typeOrder[a.type] ?? 99;
      const bType = typeOrder[b.type] ?? 99;
      if (aType !== bType) return aType - bType;
      return a.position - b.position;
    });
}

export async function updateIssueState(
  apiKey: string,
  issueId: string,
  stateId: string
): Promise<boolean> {
  const graphqlQuery = {
    query: `
      mutation UpdateIssueState($issueId: String!, $stateId: String!) {
        issueUpdate(id: $issueId, input: { stateId: $stateId }) {
          success
        }
      }
    `,
    variables: { issueId, stateId },
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
  return data?.data?.issueUpdate?.success === true;
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
