"use client";

import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { createContext, useContext, HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";

type Density = "normal" | "compact";

const DensityContext = createContext<Density>("normal");

interface TableProps extends HTMLAttributes<HTMLTableElement> {
  density?: Density;
}

export function Table({ className, density = "normal", ...props }: TableProps) {
  return (
    <DensityContext.Provider value={density}>
      <div className="w-full overflow-x-auto">
        <table className={cn("w-full text-sm border-collapse", className)} {...props} />
      </div>
    </DensityContext.Provider>
  );
}

export function TableHead({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("border-b border-surface-border", className)} {...props} />;
}

export function TableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("divide-y divide-surface-border/50", className)} {...props} />;
}

export function TableRow({
  className,
  onClick,
  ...props
}: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(onClick && "tr-hover", className)}
      onClick={onClick}
      {...props}
    />
  );
}

interface TableHeaderProps extends ThHTMLAttributes<HTMLTableCellElement> {
  sortable?: boolean;
  sortDir?: "asc" | "desc" | null;
  onSort?: () => void;
  numeric?: boolean;
}

export function TableHeader({
  sortable,
  sortDir,
  onSort,
  numeric,
  className,
  children,
  ...props
}: TableHeaderProps) {
  return (
    <th
      className={cn(
        "table-cell label whitespace-nowrap",
        numeric ? "text-right tabular-nums" : "text-left",
        sortable && "cursor-pointer select-none hover:text-text-primary transition-colors",
        className
      )}
      onClick={sortable ? onSort : undefined}
      {...props}
    >
      <span className={cn("inline-flex items-center gap-1", numeric && "justify-end w-full")}>
        {children}
        {sortable && (
          <span className="text-text-subtle">
            {sortDir === "asc" ? (
              <ChevronUp size={12} />
            ) : sortDir === "desc" ? (
              <ChevronDown size={12} />
            ) : (
              <ChevronsUpDown size={12} />
            )}
          </span>
        )}
      </span>
    </th>
  );
}

interface TableCellProps extends TdHTMLAttributes<HTMLTableCellElement> {
  mono?: boolean;
  numeric?: boolean;
}

export function TableCell({ mono, numeric, className, ...props }: TableCellProps) {
  const density = useContext(DensityContext);
  return (
    <td
      className={cn(
        "px-4 text-sm text-text-primary",
        density === "compact" ? "py-2" : "py-3",
        (mono || numeric) && "num",
        numeric && "text-right",
        className
      )}
      {...props}
    />
  );
}
