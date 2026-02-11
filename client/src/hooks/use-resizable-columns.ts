import { useState, useCallback, useRef, useEffect } from "react";

export interface ColumnDef {
  key: string;
  minWidth?: number;
  defaultWidth?: number;
  maxWidth?: number;
}

interface ResizeState {
  columnKey: string;
  startX: number;
  startWidth: number;
}

const STORAGE_VERSION = 2;

export function useResizableColumns(
  columns: ColumnDef[],
  storageKey?: string
) {
  const [widths, setWidths] = useState<Record<string, number>>(() => {
    if (storageKey) {
      try {
        const saved = localStorage.getItem(`col-widths-${storageKey}-v${STORAGE_VERSION}`);
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    const initial: Record<string, number> = {};
    columns.forEach((col) => {
      initial[col.key] = col.defaultWidth || 150;
    });
    return initial;
  });

  const resizeRef = useRef<ResizeState | null>(null);

  const saveWidths = useCallback(
    (newWidths: Record<string, number>) => {
      if (storageKey) {
        try {
          localStorage.setItem(
            `col-widths-${storageKey}-v${STORAGE_VERSION}`,
            JSON.stringify(newWidths)
          );
        } catch {}
      }
    },
    [storageKey]
  );

  const onMouseDown = useCallback(
    (columnKey: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      resizeRef.current = {
        columnKey,
        startX: e.clientX,
        startWidth: widths[columnKey] || 150,
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [widths]
  );

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      const { columnKey, startX, startWidth } = resizeRef.current;
      const col = columns.find((c) => c.key === columnKey);
      const minW = col?.minWidth || 50;
      const maxW = col?.maxWidth || 600;
      const diff = e.clientX - startX;
      const newWidth = Math.max(minW, Math.min(maxW, startWidth + diff));
      setWidths((prev) => ({ ...prev, [columnKey]: newWidth }));
    };

    const onMouseUp = () => {
      if (resizeRef.current) {
        resizeRef.current = null;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        setWidths((prev) => {
          saveWidths(prev);
          return prev;
        });
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [columns, saveWidths]);

  const getHeaderProps = useCallback(
    (columnKey: string) => ({
      style: { width: widths[columnKey] || 150, minWidth: widths[columnKey] || 150, position: "relative" as const, overflow: "hidden" as const },
    }),
    [widths]
  );

  const getResizeHandleProps = useCallback(
    (columnKey: string) => ({
      onMouseDown: (e: React.MouseEvent) => onMouseDown(columnKey, e),
      style: {
        position: "absolute" as const,
        right: 0,
        top: 0,
        bottom: 0,
        width: 4,
        cursor: "col-resize",
        zIndex: 10,
      },
      className: "group hover:bg-primary/30 active:bg-primary/50",
      "data-testid": `resize-handle-${columnKey}`,
    }),
    [onMouseDown]
  );

  const resetWidths = useCallback(() => {
    const initial: Record<string, number> = {};
    columns.forEach((col) => {
      initial[col.key] = col.defaultWidth || 150;
    });
    setWidths(initial);
    saveWidths(initial);
  }, [columns, saveWidths]);

  return { widths, getHeaderProps, getResizeHandleProps, resetWidths };
}
