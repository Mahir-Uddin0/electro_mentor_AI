"use client";

import {
  CalendarDays,
  CheckCircle2,
  CircleDashed,
  Flag,
  ListTodo,
  PlayCircle,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import { Badge, Button, Card, MetricCard, PageHeading } from "@/components/ui";
import {
  frontendApi,
  type CreateTaskInput,
  type Task,
  type TaskPriority,
  type TaskStatus,
  type UpdateTaskInput,
} from "@/lib/api/client";

const priorityRank: Record<TaskPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const statusLabels: Record<TaskStatus, string> = {
  upcoming: "Upcoming",
  in_progress: "In Progress",
  completed: "Completed",
};

const priorityLabels: Record<TaskPriority, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

const statusColumns = [
  {
    status: "upcoming" as const,
    label: "Upcoming",
    description: "Work you plan to start next.",
    icon: CircleDashed,
  },
  {
    status: "in_progress" as const,
    label: "In Progress",
    description: "Work you are currently completing.",
    icon: PlayCircle,
  },
  {
    status: "completed" as const,
    label: "Completed",
    description: "Finished work and accomplishments.",
    icon: CheckCircle2,
  },
];

const emptyForm: CreateTaskInput = {
  title: "",
  description: "",
  status: "upcoming",
  priority: "medium",
  due_date: null,
};

function formatDate(value: string) {
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function availableStatuses(status: TaskStatus): TaskStatus[] {
  if (status === "upcoming") return ["upcoming", "in_progress"];
  if (status === "in_progress") return ["in_progress", "completed"];
  return ["completed"];
}

function TaskCard({
  task,
  busy,
  onUpdate,
  onDelete,
}: {
  task: Task;
  busy: boolean;
  onUpdate: (taskId: string, changes: UpdateTaskInput) => Promise<void>;
  onDelete: (task: Task) => Promise<void>;
}) {
  const priorityTone = task.priority === "high"
    ? "red"
    : task.priority === "medium"
      ? "amber"
      : "blue";

  return (
    <Card className={`tracker-task-card ${busy ? "is-busy" : ""}`}>
      <div className="tracker-task-head">
        <Badge tone={priorityTone}>
          <Flag size={11} /> {priorityLabels[task.priority]} priority
        </Badge>
        <button
          type="button"
          className="tracker-delete"
          onClick={() => void onDelete(task)}
          disabled={busy}
          aria-label={`Delete ${task.title}`}
          title="Delete task"
        >
          <Trash2 size={15} />
        </button>
      </div>

      <div className="tracker-task-copy">
        <h3>{task.title}</h3>
        {task.description && <p>{task.description}</p>}
      </div>

      <div className="tracker-task-date">
        <CalendarDays size={14} />
        {task.status === "completed" && task.completed_at
          ? `Completed ${formatDate(task.completed_at)}`
          : task.due_date
            ? `Due ${formatDate(task.due_date)}`
            : "No due date"}
      </div>

      <div className="tracker-task-controls">
        <label>
          <span>Status</span>
          <select
            value={task.status}
            disabled={busy || task.status === "completed"}
            onChange={(event) =>
              void onUpdate(task.id, { status: event.target.value as TaskStatus })
            }
            aria-label={`Status for ${task.title}`}
          >
            {availableStatuses(task.status).map((status) => (
              <option value={status} key={status}>{statusLabels[status]}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Priority</span>
          <select
            value={task.priority}
            disabled={busy}
            onChange={(event) =>
              void onUpdate(task.id, {
                priority: event.target.value as TaskPriority,
              })
            }
            aria-label={`Priority for ${task.title}`}
          >
            {(["high", "medium", "low"] as const).map((priority) => (
              <option value={priority} key={priority}>{priorityLabels[priority]}</option>
            ))}
          </select>
        </label>
      </div>
      {busy && <span className="tracker-task-saving"><span className="spinner" /> Saving…</span>}
    </Card>
  );
}

export default function TaskTrackerPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyTaskIds, setBusyTaskIds] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<CreateTaskInput>(emptyForm);
  const [formError, setFormError] = useState("");

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await frontendApi.listTasks();
      setTasks(response.tasks);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Your tasks could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    if (!createOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !creating) setCreateOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [createOpen, creating]);

  const groupedTasks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const matchingTasks = tasks.filter((task) =>
      !normalizedQuery || `${task.title} ${task.description}`.toLowerCase().includes(normalizedQuery),
    );
    const grouped: Record<TaskStatus, Task[]> = {
      upcoming: [],
      in_progress: [],
      completed: [],
    };
    for (const task of matchingTasks) grouped[task.status].push(task);
    for (const status of ["upcoming", "in_progress"] as const) {
      grouped[status].sort((left, right) =>
        priorityRank[left.priority] - priorityRank[right.priority] ||
        (left.due_date ?? "9999-12-31").localeCompare(right.due_date ?? "9999-12-31") ||
        left.created_at.localeCompare(right.created_at),
      );
    }
    grouped.completed.sort((left, right) =>
      (right.completed_at ?? right.updated_at).localeCompare(
        left.completed_at ?? left.updated_at,
      ),
    );
    return grouped;
  }, [query, tasks]);

  function openCreateTask() {
    setForm(emptyForm);
    setFormError("");
    setCreateOpen(true);
  }

  function setTaskBusy(taskId: string, busy: boolean) {
    setBusyTaskIds((current) => {
      const next = new Set(current);
      if (busy) next.add(taskId);
      else next.delete(taskId);
      return next;
    });
  }

  async function updateTask(taskId: string, changes: UpdateTaskInput) {
    setTaskBusy(taskId, true);
    setError("");
    try {
      const updated = await frontendApi.updateTask(taskId, changes);
      setTasks((current) => current.map((task) => task.id === taskId ? updated : task));
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The task could not be updated.",
      );
    } finally {
      setTaskBusy(taskId, false);
    }
  }

  async function deleteTask(task: Task) {
    if (!window.confirm(`Delete “${task.title}”? This cannot be undone.`)) return;
    setTaskBusy(task.id, true);
    setError("");
    try {
      await frontendApi.deleteTask(task.id);
      setTasks((current) => current.filter((item) => item.id !== task.id));
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The task could not be deleted.",
      );
    } finally {
      setTaskBusy(task.id, false);
    }
  }

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = form.title.trim();
    if (!title) {
      setFormError("Enter a task title.");
      return;
    }

    setCreating(true);
    setFormError("");
    try {
      const created = await frontendApi.createTask({
        ...form,
        title,
        description: form.description?.trim() ?? "",
        due_date: form.due_date || null,
      });
      setTasks((current) => [created, ...current]);
      setCreateOpen(false);
      setForm(emptyForm);
    } catch (requestError) {
      setFormError(
        requestError instanceof Error
          ? requestError.message
          : "The task could not be created.",
      );
    } finally {
      setCreating(false);
    }
  }

  const completedCount = tasks.filter((task) => task.status === "completed").length;
  const inProgressCount = tasks.filter((task) => task.status === "in_progress").length;
  const upcomingCount = tasks.filter((task) => task.status === "upcoming").length;

  return (
    <>
      <PageHeading
        title="Task Tracker"
        description="Create, prioritize, and move your work from upcoming to completed."
        action={<Button icon={Plus} onClick={openCreateTask}>Create Task</Button>}
      />

      <div className="metric-grid">
        <MetricCard label="All Tasks" value={tasks.length} icon={ListTodo} />
        <MetricCard label="Upcoming" value={upcomingCount} icon={CircleDashed} tone="amber" />
        <MetricCard label="In Progress" value={inProgressCount} icon={PlayCircle} tone="blue" />
        <MetricCard label="Completed" value={completedCount} icon={CheckCircle2} tone="green" />
      </div>

      <div className="filters tracker-filters">
        <label className="search-field">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search your tasks…"
            aria-label="Search tasks"
          />
        </label>
      </div>

      {error && (
        <div className="tracker-error auth-message error" role="alert">
          <span>{error}</span>
          <Button variant="ghost" icon={RefreshCw} onClick={() => void loadTasks()}>
            Retry
          </Button>
        </div>
      )}

      {loading ? (
        <div className="full-loader tracker-loader">
          <span className="spinner" /> Loading your tasks…
        </div>
      ) : (
        <div className="tracker-board">
          {statusColumns.map((column) => {
            const Icon = column.icon;
            const columnTasks = groupedTasks[column.status];
            return (
              <section className={`tracker-column tracker-column-${column.status}`} key={column.status}>
                <header className="tracker-column-head">
                  <span className="tracker-column-icon"><Icon size={18} /></span>
                  <div>
                    <h2>{column.label}</h2>
                    <p>{column.description}</p>
                  </div>
                  <span className="tracker-column-count">{columnTasks.length}</span>
                </header>
                <div className="tracker-column-list">
                  {columnTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      busy={busyTaskIds.has(task.id)}
                      onUpdate={updateTask}
                      onDelete={deleteTask}
                    />
                  ))}
                  {!columnTasks.length && (
                    <div className="tracker-column-empty">
                      <Icon size={22} />
                      <strong>{query ? "No matching tasks" : `No ${column.label.toLowerCase()} tasks`}</strong>
                      <span>{query ? "Try a different search." : "Tasks will appear here automatically."}</span>
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {createOpen && (
        <div
          className="tracker-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !creating) setCreateOpen(false);
          }}
        >
          <section
            className="tracker-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-task-title"
          >
            <div className="tracker-modal-head">
              <div>
                <h2 id="create-task-title">Create a task</h2>
                <p>Add work to your upcoming or in-progress list.</p>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setCreateOpen(false)}
                disabled={creating}
                aria-label="Close create task form"
              >
                <X size={19} />
              </button>
            </div>

            <form className="tracker-form" onSubmit={createTask}>
              <div className="field">
                <label htmlFor="task-title">Task title <span aria-hidden="true">*</span></label>
                <input
                  id="task-title"
                  autoFocus
                  required
                  maxLength={160}
                  value={form.title}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder="e.g. Wire the workshop distribution board"
                />
              </div>
              <div className="field">
                <label htmlFor="task-description">Description</label>
                <textarea
                  id="task-description"
                  maxLength={2000}
                  value={form.description}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder="Add notes or the result you want to achieve."
                />
              </div>
              <div className="tracker-form-row">
                <div className="field">
                  <label htmlFor="task-status">Status <span aria-hidden="true">*</span></label>
                  <select
                    id="task-status"
                    required
                    value={form.status}
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      status: event.target.value as CreateTaskInput["status"],
                    }))}
                  >
                    <option value="upcoming">Upcoming</option>
                    <option value="in_progress">In Progress</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="task-priority">Priority <span aria-hidden="true">*</span></label>
                  <select
                    id="task-priority"
                    required
                    value={form.priority}
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      priority: event.target.value as TaskPriority,
                    }))}
                  >
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>
              <div className="field">
                <label htmlFor="task-due-date">Due date</label>
                <input
                  id="task-due-date"
                  type="date"
                  value={form.due_date ?? ""}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    due_date: event.target.value || null,
                  }))}
                />
              </div>

              {formError && <div className="auth-message error" role="alert">{formError}</div>}

              <div className="tracker-modal-actions">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={creating}
                  onClick={() => setCreateOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" icon={Plus} disabled={creating}>
                  {creating ? "Creating…" : "Create Task"}
                </Button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
