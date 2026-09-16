"use client";
import { type ReactNode } from "react";
import styles from "./preview.module.css";
export function LearningTable({
  label,
  heads,
  rows,
  className = "",
}: {
  label: string;
  heads: string[];
  rows: ReactNode[][];
  className?: string;
}) {
  return rows.length ? (
    <div className={`admin-table-frame ${styles.learningTable} ${className}`}>
      <table aria-label={label}>
        <thead>
          <tr>
            {heads.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, i) =>
                i === 0 ? (
                  <th key={i} scope="row" data-label={heads[i]}>
                    {cell}
                  </th>
                ) : (
                  <td key={i} data-label={heads[i]}>
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <p className="admin-empty-state">{label}: 표시할 기록이 없습니다.</p>
  );
}
export const value = (n: number | null | undefined, suffix = "") =>
  n == null ? "자료 없음" : `${Number(n.toFixed(1))}${suffix}`;
