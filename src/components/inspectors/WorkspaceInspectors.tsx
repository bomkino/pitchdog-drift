import {
  Children,
  Fragment,
  isValidElement,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { MeasuredDisclosure } from "../MeasuredDisclosure";

export type StudioWorkspace = "slides" | "look" | "motion" | "export";
type WorkspaceSectionLevel = "primary" | "advanced";
const STUDIO_WORKSPACES: readonly StudioWorkspace[] = ["slides", "look", "motion", "export"];

interface WorkspaceSectionProps {
  workspace: StudioWorkspace;
  level?: WorkspaceSectionLevel;
  children: ReactNode;
}

/**
 * A declarative section marker consumed by WorkspaceInspector. The marker
 * itself never mounts; its child is routed into that workspace's pane.
 */
export function WorkspaceSection({ children }: WorkspaceSectionProps) {
  return <>{children}</>;
}

interface TaskInspectorProps {
  workspace: StudioWorkspace;
  primary: readonly ReactNode[];
  advanced: readonly ReactNode[];
  advancedOpen: boolean;
  onAdvancedOpen: (open: boolean) => void;
}

function TaskInspector({
  workspace,
  primary,
  advanced,
  advancedOpen,
  onAdvancedOpen,
}: TaskInspectorProps) {
  return (
    <section className="workspace-content" data-workspace-content={workspace} aria-label={`${workspace} workspace`}>
      {primary}
      {advanced.length ? (
        <MeasuredDisclosure
          className="workspace-advanced"
          triggerClassName="workspace-advanced-trigger"
          viewportClassName="workspace-advanced-viewport"
          contentClassName="workspace-advanced-body"
          expanded={advancedOpen}
          onExpandedChange={onAdvancedOpen}
          trigger={(
            <>
              <span>Advanced</span>
              <small>Fine control</small>
            </>
          )}
        >
          {advanced}
        </MeasuredDisclosure>
      ) : null}
    </section>
  );
}

export function SlidesInspector(props: Omit<TaskInspectorProps, "workspace">) {
  return <TaskInspector workspace="slides" {...props} />;
}

export function LookInspector(props: Omit<TaskInspectorProps, "workspace">) {
  return <TaskInspector workspace="look" {...props} />;
}

export function MotionInspector(props: Omit<TaskInspectorProps, "workspace">) {
  return <TaskInspector workspace="motion" {...props} />;
}

export function ExportInspector(props: Omit<TaskInspectorProps, "workspace">) {
  return <TaskInspector workspace="export" {...props} />;
}

interface WorkspaceInspectorProps {
  workspace: StudioWorkspace;
  children: ReactNode;
}

type WorkspaceSectionElement = ReactElement<WorkspaceSectionProps, typeof WorkspaceSection>;

function isWorkspaceSection(node: ReactNode): node is WorkspaceSectionElement {
  return isValidElement<WorkspaceSectionProps>(node) && node.type === WorkspaceSection;
}

/**
 * Keeps one scroll pane per workspace so changing tasks never rewrites a
 * shared scroll position after paint. Inactive panes remain mounted for local
 * disclosure/scroll memory, while absolute stacking, `visibility`,
 * `aria-hidden`, and `inert` remove them from layout, focus, and accessibility.
 */
export function WorkspaceInspector({ workspace, children }: WorkspaceInspectorProps) {
  const [advancedOpen, setAdvancedOpen] = useState<Record<StudioWorkspace, boolean>>({
    slides: false,
    look: false,
    motion: false,
    export: false,
  });
  const allSections = Children.toArray(children).filter(isWorkspaceSection);

  return (
    <div className="workspace-pane-stack">
      {STUDIO_WORKSPACES.map((id) => {
        const sections = allSections.filter((section) => section.props.workspace === id);
        const primary = sections
          .filter((section) => (section.props.level ?? "primary") === "primary")
          .map((section) => <Fragment key={section.key}>{section.props.children}</Fragment>);
        const advanced = sections
          .filter((section) => section.props.level === "advanced")
          .map((section) => <Fragment key={section.key}>{section.props.children}</Fragment>);
        const shared = {
          primary,
          advanced,
          advancedOpen: advancedOpen[id],
          onAdvancedOpen: (open: boolean) => setAdvancedOpen((current) => (
            current[id] === open ? current : { ...current, [id]: open }
          )),
        };
        const active = id === workspace;
        const inspector = id === "slides"
          ? <SlidesInspector {...shared} />
          : id === "look"
            ? <LookInspector {...shared} />
            : id === "motion"
              ? <MotionInspector {...shared} />
              : <ExportInspector {...shared} />;

        return (
          <div
            className="workspace-scroll"
            data-testid={active ? "workspace-scroll" : undefined}
            data-workspace-pane={id}
            data-active={active}
            aria-hidden={!active}
            inert={!active}
            key={id}
          >
            {inspector}
          </div>
        );
      })}
    </div>
  );
}
