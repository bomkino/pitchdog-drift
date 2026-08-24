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

interface WorkspaceSectionProps {
  workspace: StudioWorkspace;
  level?: WorkspaceSectionLevel;
  children: ReactNode;
}

/**
 * A declarative section marker consumed by WorkspaceInspector. The marker is
 * never mounted itself: inactive workspace children never enter the DOM.
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
 * Explicitly selects one workspace component. This replaces the former
 * render-everything + CSS display switch and keeps inactive controls out of
 * focus order, layout, accessibility, and browser work.
 */
export function WorkspaceInspector({ workspace, children }: WorkspaceInspectorProps) {
  const [advancedOpen, setAdvancedOpen] = useState<Record<StudioWorkspace, boolean>>({
    slides: false,
    look: false,
    motion: false,
    export: false,
  });
  const sections = Children.toArray(children)
    .filter(isWorkspaceSection)
    .filter((section) => section.props.workspace === workspace);
  const primary = sections
    .filter((section) => (section.props.level ?? "primary") === "primary")
    .map((section) => <Fragment key={section.key}>{section.props.children}</Fragment>);
  const advanced = sections
    .filter((section) => section.props.level === "advanced")
    .map((section) => <Fragment key={section.key}>{section.props.children}</Fragment>);
  const shared = {
    primary,
    advanced,
    advancedOpen: advancedOpen[workspace],
    onAdvancedOpen: (open: boolean) => setAdvancedOpen((current) => (
      current[workspace] === open ? current : { ...current, [workspace]: open }
    )),
  };

  switch (workspace) {
    case "slides":
      return <SlidesInspector {...shared} />;
    case "look":
      return <LookInspector {...shared} />;
    case "motion":
      return <MotionInspector {...shared} />;
    case "export":
      return <ExportInspector {...shared} />;
  }
}
