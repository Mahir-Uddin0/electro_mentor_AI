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
import { useLanguage } from "@/components/language-provider";
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

function formatDate(value: string, locale: string) {
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
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
  const { locale, t } = useLanguage();
  const priorityTone = task.priority === "high"
    ? "red"
    : task.priority === "medium"
      ? "amber"
      : "blue";

  return (
    <Card className={`tracker-task-card ${busy ? "is-busy" : ""}`}>
      <div className="tracker-task-head">
        <Badge tone={priorityTone}>
          <Flag size={11} /> {t(priorityLabels[task.priority])} {t("Priority")}
        </Badge>
        <button
          type="button"
          className="tracker-delete"
          onClick={() => void onDelete(task)}
          disabled={busy}
          aria-label={`${t("Delete")} ${task.title}`}
          title={t("Delete task")}
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
          ? `${t("Completed")} ${formatDate(task.completed_at, locale)}`
          : task.due_date
            ? `${t("Due")} ${formatDate(task.due_date, locale)}`
            : t("No due date")}
      </div>

      <div className="tracker-task-controls">
        <label>
          <span>{t("Status")}</span>
          <select
            value={task.status}
            disabled={busy || task.status === "completed"}
            onChange={(event) =>
              void onUpdate(task.id, { status: event.target.value as TaskStatus })
            }
            aria-label={`${t("Status")} ${task.title}`}
          >
            {availableStatuses(task.status).map((status) => (
              <option value={status} key={status}>{t(statusLabels[status])}</option>
            ))}
          </select>
        </label>
        <label>
          <span>{t("Priority")}</span>
          <select
            value={task.priority}
            disabled={busy}
            onChange={(event) =>
              void onUpdate(task.id, {
                priority: event.target.value as TaskPriority,
              })
            }
            aria-label={`${t("Priority")} ${task.title}`}
          >
            {(["high", "medium", "low"] as const).map((priority) => (
              <option value={priority} key={priority}>{t(priorityLabels[priority])}</option>
            ))}
          </select>
        </label>
      </div>
      {busy && <span className="tracker-task-saving"><span className="spinner" /> {t("Saving…")}</span>}
    </Card>
  );
}

export default function TaskTrackerPage() {
  const { locale, t } = useLanguage();
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
          : t("Your tasks could not be loaded."),
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

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
          : t("The task could not be updated."),
      );
    } finally {
      setTaskBusy(taskId, false);
    }
  }

  async function deleteTask(task: Task) {
    if (!window.confirm(t("Delete “{{title}}”? This cannot be undone.", { title: task.title }))) return;
    setTaskBusy(task.id, true);
    setError("");
    try {
      await frontendApi.deleteTask(task.id);
      setTasks((current) => current.filter((item) => item.id !== task.id));
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t("The task could not be deleted."),
      );
    } finally {
      setTaskBusy(task.id, false);
    }
  }

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = form.title.trim();
    if (!title) {
      setFormError(t("Enter a task title."));
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
          : t("The task could not be created."),
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
        title={t("Task Tracker")}
        description={t("Create, prioritize, and move your work from upcoming to completed.")}
        action={<Button icon={Plus} onClick={openCreateTask}>{t("Create Task")}</Button>}
      />

      <div className="metric-grid">
        <MetricCard label={t("All Tasks")} value={new Intl.NumberFormat(locale).format(tasks.length)} icon={ListTodo} />
        <MetricCard label={t("Upcoming")} value={new Intl.NumberFormat(locale).format(upcomingCount)} icon={CircleDashed} tone="amber" />
        <MetricCard label={t("In Progress")} value={new Intl.NumberFormat(locale).format(inProgressCount)} icon={PlayCircle} tone="blue" />
        <MetricCard label={t("Completed")} value={new Intl.NumberFormat(locale).format(completedCount)} icon={CheckCircle2} tone="green" />
      </div>

      <div className="filters tracker-filters">
        <label className="search-field">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("Search your tasks…")}
            aria-label={t("Search your tasks…")}
          />
        </label>
      </div>

      {error && (
        <div className="tracker-error auth-message error" role="alert">
          <span>{error}</span>
          <Button variant="ghost" icon={RefreshCw} onClick={() => void loadTasks()}>
            {t("Retry")}
          </Button>
        </div>
      )}

      {loading ? (
        <div className="full-loader tracker-loader">
          <span className="spinner" /> {t("Loading your tasks…")}
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
                    <h2>{t(column.label)}</h2>
                    <p>{t(column.description)}</p>
                  </div>
                  <span className="tracker-column-count">{new Intl.NumberFormat(locale).format(columnTasks.length)}</span>
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
                      <strong>{query ? t("No matching tasks") : t("No tasks here yet")}</strong>
                      <span>{query ? t("Try a different search.") : t("Tasks will appear here automatically.")}</span>
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
                <h2 id="create-task-title">{t("Create a task")}</h2>
                <p>{t("Add work to your upcoming or in-progress list.")}</p>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setCreateOpen(false)}
                disabled={creating}
                aria-label={t("Close create task form")}
              >
                <X size={19} />
              </button>
            </div>

            <form className="tracker-form" onSubmit={createTask}>
              <div className="field">
                <label htmlFor="task-title">{t("Task title")} <span aria-hidden="true">*</span></label>
                <input
                  id="task-title"
                  autoFocus
                  required
                  maxLength={160}
                  value={form.title}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder={t("e.g. Wire the workshop distribution board")}
                />
              </div>
              <div className="field">
                <label htmlFor="task-description">{t("Description")}</label>
                <textarea
                  id="task-description"
                  maxLength={2000}
                  value={form.description}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder={t("Add notes or the result you want to achieve.")}
                />
              </div>
              <div className="tracker-form-row">
                <div className="field">
                  <label htmlFor="task-status">{t("Status")} <span aria-hidden="true">*</span></label>
                  <select
                    id="task-status"
                    required
                    value={form.status}
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      status: event.target.value as CreateTaskInput["status"],
                    }))}
                  >
                    <option value="upcoming">{t("Upcoming")}</option>
                    <option value="in_progress">{t("In Progress")}</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="task-priority">{t("Priority")} <span aria-hidden="true">*</span></label>
                  <select
                    id="task-priority"
                    required
                    value={form.priority}
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      priority: event.target.value as TaskPriority,
                    }))}
                  >
                    <option value="high">{t("High")}</option>
                    <option value="medium">{t("Medium")}</option>
                    <option value="low">{t("Low")}</option>
                  </select>
                </div>
              </div>
              <div className="field">
                <label htmlFor="task-due-date">{t("Due date")}</label>
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
                  {t("Cancel")}
                </Button>
                <Button type="submit" icon={Plus} disabled={creating}>
                  {creating ? t("Creating…") : t("Create Task")}
                </Button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
