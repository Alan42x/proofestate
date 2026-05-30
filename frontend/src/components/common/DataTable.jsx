export function DataTable({ className = "", columns, rows, emptyText, loadingText, loading = false, rowKey }) {
  return (
    <div className={`loan-table ${className}`}>
      <div className={`loan-table-head ${className}`}>
        {columns.map((column) => (
          <span key={column.key}>{column.label}</span>
        ))}
      </div>
      {rows.length === 0 ? (
        <p>{loading ? loadingText : emptyText}</p>
      ) : (
        rows.map((row) => {
          const key = rowKey(row);
          const content = columns.map((column) => {
            const value = column.render ? column.render(row) : row[column.key];
            return column.strong ? <strong key={column.key}>{value}</strong> : <span key={column.key}>{value}</span>;
          });

          if (row.onSelect) {
            return (
              <button className={`loan-table-row ${className} selectable ${row.active ? "active" : ""}`} key={key} onClick={row.onSelect}>
                {content}
              </button>
            );
          }

          return (
            <div className={`loan-table-row ${className}`} key={key}>
              {content}
            </div>
          );
        })
      )}
    </div>
  );
}

export function DetailList({ items }) {
  return (
    <dl className="detail-list">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
