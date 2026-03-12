"use client";

import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import {
  createContext, useContext,
  HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes,
} from "react";

type Density = "normal" | "compact";

const DensityContext = createContext<Density>("normal");

interface TableProps extends HTMLAttributes<HTMLTableElement> {
  density?: Density;
}

export function Table({ className, density = "normal", ...props }: TableProps) {
  return (
    <DensityContext.Provider value={density}>
      <div className="w-full overflow-x-auto">
        <table
          className={cn("data-table", density === "compact" && "compact", className)}
          {...props}
        />
      </div>
    </DensityContext.Provider>
  );
}

export function TableHead({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn("sticky top-0 z-10", className)}
      style={{ background: "var(--bg2)" }}
      {...props}
    />
  );
}

export function TableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={className} {...props} />;
}

export function TableRow({ className, onClick, ...props }: HTMLAttributes<HTMLTableRowElement>) {
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
  sortDir?:  "asc" | "desc" | null;
  onSort?:   () => void;
  numeric?:  boolean;
}

export function TableHeader({
  sortable, sortDir, onSort, numeric, className, children, ...props
}: TableHeaderProps) {
  return (
    <th
      className={cn(
        numeric && "col-right",
        sortable && "cursor-pointer select-none",
        className
      )}
      style={{ color: sortable ? undefined : "var(--text1)" }}
      onClick={sortable ? onSort : undefined}
      {...props}
    >
      <span
        style={{
          display:        "inline-flex",
          alignItems:     "center",
          gap:            4,
          justifyContent: numeric ? "flex-end" : "flex-start",
          width:          numeric ? "100%" : undefined,
        }}
      >
        {children}
        {sortable && (
          <span style={{ color: "var(--text2)" }}>
            {sortDir === "asc"  ? <ChevronUp size={10} /> :
             sortDir === "desc" ? <ChevronDown size={10} /> :
             <ChevronsUpDown size={10} />}
          </span>
        )}
      </span>
    </th>
  );
}

interface TableCellProps extends TdHTMLAttributes<HTMLTableCellElement> {
  mono?:    boolean;
  numeric?: boolean;
}

export function TableCell({ mono, numeric, className, ...props }: TableCellProps) {
  const density = useContext(DensityContext);
  return (
    <td
      className={cn(
        (mono || numeric) && "num",
        numeric && "col-right",
        density === "compact" ? "py-1" : "py-2",
        className
      )}
      {...props}
    />
  );
}
