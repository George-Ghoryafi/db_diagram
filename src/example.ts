// A portable DBML example, shared by the browser and fresh server workspaces.
export const example = `// Welcome! This is a small project-management schema.
// Click a relationship to see its name and connected fields.
// Try Groups, Indexes, sticky notes, or Keys only in the toolbar.
// Edit this DBML, then Save. Export it to use in dbdiagram.io.

Project Team_workspace {
  database_type: 'PostgreSQL'
  Note: 'A shared workspace with members, projects, and tasks.'
}

Enum task_status {
  todo
  in_progress
  done
}

Table users [headercolor: #326d94] {
  id integer [pk, increment]
  name varchar(100) [not null]
  email varchar(255) [not null, unique]
  created_at timestamp [default: \`now()\`]
}

Table workspaces [headercolor: #326d94] {
  id integer [pk, increment]
  name varchar(100) [not null]
  slug varchar(100) [not null, unique]
}

// A join table: users can belong to many workspaces.
Table memberships [headercolor: #326d94] {
  workspace_id integer [not null]
  user_id integer [not null]
  role varchar(20) [default: 'member']

  indexes {
    (workspace_id, user_id) [pk, name: 'membership_pk']
  }
}

Table projects [headercolor: #3c877c] {
  id integer [pk, increment]
  workspace_id integer [not null]
  owner_id integer [not null]
  name varchar(150) [not null]
}

Table tasks [headercolor: #3c877c] {
  id integer [pk, increment]
  project_id integer [not null]
  assignee_id integer
  title varchar(255) [not null, note: 'A short, actionable task title.']
  status task_status [not null, default: 'todo']

  indexes {
    (project_id, status) [name: 'tasks_by_project_status']
  }
}

// Named relationships become labels when you click an edge.
Ref workspace_members: workspaces.id < memberships.workspace_id
Ref user_memberships: users.id < memberships.user_id
Ref workspace_projects: workspaces.id < projects.workspace_id
Ref project_owner: users.id < projects.owner_id
Ref project_tasks: projects.id < tasks.project_id
Ref task_assignee: users.id < tasks.assignee_id

TableGroup Identity [color: #a8c8e3] {
  users
  workspaces
  memberships
}

TableGroup Project_work [color: #a3cebd] {
  projects
  tasks
}

Note Explore {
  'Click an edge to highlight its fields.\\nTry Keys only, snap to grid, and the layout menu.\\nThis note is editable: double-click it.'
}
`;
export const exampleLayout: Record<string, { x: number; y: number }> = {
  "public.users": { x: 60, y: 100 },
  "public.workspaces": { x: 60, y: 400 },
  "public.memberships": { x: 380, y: 280 },
  "public.projects": { x: 740, y: 100 },
  "public.tasks": { x: 740, y: 400 },
  "note:Explore": { x: 380, y: 570 },
};
export const exampleDocument = {
  id: "welcome",
  name: "Team workspace · example",
  dbml: example,
  revision: "",
  layout: exampleLayout,
  storage: "browser" as const,
};
