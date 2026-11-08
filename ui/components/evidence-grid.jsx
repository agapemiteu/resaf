import React, { useEffect, useRef, useState } from 'react';
import {
  presentRaceRow,
  raceSummary,
  readable,
  requestStages,
} from '../grid-view.mjs';

function textCell(value, className) {
  const el = document.createElement('span');
  el.className = className;
  el.textContent = value;
  return el;
}
export function EvidenceGrid({
  rows,
  type = 'race',
  onSelect,
  connected = true,
}) {
  const container = useRef(null),
    grid = useRef(null),
    inspect = useRef(onSelect),
    [ready, setReady] = useState(!!window.agGrid),
    [unavailable, setUnavailable] = useState(false);
  inspect.current = onSelect;
  const race = type === 'race';
  const displayRows = race ? rows.map(presentRaceRow) : rows;
  useEffect(() => {
    const loaded = () => {
      setReady(true);
      setUnavailable(false);
    };
    window.addEventListener('ag-grid-ready', loaded);
    const timeout = setTimeout(() => {
      if (!window.agGrid) setUnavailable(true);
    }, 5000);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener('ag-grid-ready', loaded);
    };
  }, []);
  useEffect(() => {
    if (!ready || !container.current) return;
    const detail = (params) => {
      if (!params.data?.evidence) return '';
      const button = document.createElement('button');
      button.className = 'grid-inspect';
      button.type = 'button';
      button.textContent = 'View';
      button.setAttribute(
        'aria-label',
        `View ${params.data.actor} request details`,
      );
      button.addEventListener('click', () =>
        inspect.current?.(params.data.evidence),
      );
      button.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.stopPropagation();
          event.preventDefault();
          button.click();
        }
      });
      return button;
    };
    const buyer = (params) => {
      const el = document.createElement('span');
      el.className = 'grid-buyer';
      const avatar = textCell(
        params.value?.replace('Agent ', '') || 'R',
        'grid-avatar',
      );
      el.append(avatar, document.createTextNode(params.value || 'Resaf'));
      return el;
    };
    const timeline = (params) => {
      const el = document.createElement('span');
      el.className = 'grid-path';
      const stages = requestStages(params.data.evidence, params.data.outcome);
      el.setAttribute('role', 'img');
      el.setAttribute(
        'aria-label',
        stages.map((s) => s.label + ': ' + s.state).join(', '),
      );
      el.title = stages.map((s) => s.label + ': ' + s.state).join(' / ');
      for (const stage of stages) {
        const bar = textCell('', 'grid-stage stage-' + stage.state);
        el.append(bar);
      }
      return el;
    };
    const columns = race
      ? [
          {
            field: 'actor',
            headerName: 'Buyer',
            width: 142,
            pinned: 'left',
            lockPinned: true,
            cellRenderer: buyer,
          },
          {
            colId: 'timeline',
            headerName: 'Timeline',
            width: 144,
            sortable: false,
            cellRenderer: timeline,
          },
          {
            field: 'statusLabel',
            headerName: 'Status',
            minWidth: 120,
            flex: 1,
            cellRenderer: (p) =>
              textCell(p.value, `grid-pill tone-${p.data.tone}`),
          },
          { field: 'next', headerName: 'Next action', minWidth: 190, flex: 1 },
        ]
      : [
          { field: 'actor', headerName: 'Actor', width: 130 },
          {
            field: 'action',
            headerName: 'Event',
            minWidth: 210,
            flex: 1,
            valueFormatter: (p) => readable(p.value),
          },
          {
            field: 'outcome',
            headerName: 'Result',
            minWidth: 180,
            flex: 1,
            valueFormatter: (p) => readable(p.value),
          },
        ];
    try {
      grid.current = window.agGrid.createGrid(container.current, {
        theme: window.agGrid.themeQuartz.withParams({
          fontFamily: 'system-ui,-apple-system,sans-serif',
          fontSize: 13,
          headerFontSize: 12,
          backgroundColor: '#1d2735',
          foregroundColor: '#edf2fa',
          borderColor: '#354152',
          accentColor: '#65acff',
          headerBackgroundColor: '#273344',
          headerTextColor: '#b7c3d4',
          rowHoverColor: '#25354b',
          cellHorizontalPadding: 16,
          borderRadius: 12,
        }),
        columnDefs: [
          ...columns,
          {
            colId: 'details',
            headerName: '',
            width: 72,
            sortable: false,
            resizable: false,
            cellRenderer: detail,
          },
        ],
        defaultColDef: {
          resizable: true,
          sortable: true,
          suppressMovable: true,
        },
        getRowId: (p) => p.data.id,
        onGridSizeChanged: (params) => {
          if (!race) return;
          const compact = container.current.clientWidth < 560;
          params.api.setColumnsVisible(['timeline', 'next'], !compact);
          params.api.setColumnWidths([
            { key: 'actor', newWidth: compact ? 108 : 142 },
            { key: 'details', newWidth: compact ? 56 : 72 },
          ]);
        },
        rowHeight: race ? 68 : 48,
        headerHeight: 44,
        animateRows: !window.matchMedia('(prefers-reduced-motion: reduce)')
          .matches,
        rowClassRules: {
          'race-row-reserved': (p) =>
            p.data.tone === 'reserved' || p.data.tone === 'booked',
          'race-row-claim': (p) => p.data.tone === 'claim',
          'race-row-error': (p) => p.data.tone === 'error',
        },
        tooltipShowDelay: 300,
        ariaLabel: race
          ? 'Competing reservation requests'
          : 'Reservation event ledger',
        overlayNoRowsTemplate:
          '<span class="grid-empty">No events in this run</span>',
        rowData: displayRows,
      });
      setUnavailable(false);
    } catch {
      setUnavailable(true);
    }
    return () => {
      grid.current?.destroy();
      grid.current = null;
    };
  }, [ready, type]);
  useEffect(() => {
    grid.current?.setGridOption('rowData', displayRows);
  }, [rows, type]);
  return (
    <section
      className="grid-section"
      aria-label={race ? 'Reservation race' : 'Event ledger'}
    >
      {race && (
        <div className="grid-overview">
          <span
            className={`grid-overview-dot ${connected === false ? 'is-offline' : ''}`}
            aria-hidden="true"
          />
          <strong aria-live="polite">
            {connected === false
              ? 'Connection lost - last confirmed state'
              : raceSummary(rows)}
          </strong>
          <span className="grid-provider">
            {ready && !unavailable ? 'AG Grid' : 'Table view'}
          </span>
        </div>
      )}
      {ready && (
        <div
          ref={container}
          className={`evidence-grid ${race ? 'race-grid' : ''}`}
          hidden={unavailable}
        />
      )}
      {(!ready || unavailable) && (
        <div className="grid-fallback">
          <table>
            <caption className="sr-only">
              {race ? 'Competing reservation requests' : 'Reservation events'}
            </caption>
            <thead>
              <tr>
                {(race
                  ? ['Buyer', 'Timeline', 'Status', 'Next action']
                  : ['Actor', 'Event', 'Result']
                ).map((label) => (
                  <th scope="col" key={label}>
                    {label}
                  </th>
                ))}
                <th scope="col">
                  <span className="sr-only">Details</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row) => (
                <tr key={row.id}>
                  <th scope="row">{row.actor}</th>
                  {race ? (
                    <>
                      <td>
                        <span
                          className="grid-path"
                          role="img"
                          aria-label={requestStages(row.evidence, row.outcome)
                            .map((s) => s.label + ': ' + s.state)
                            .join(', ')}
                        >
                          {requestStages(row.evidence, row.outcome).map((s) => (
                            <span
                              key={s.label}
                              className={'grid-stage stage-' + s.state}
                              title={s.label + ': ' + s.state}
                            />
                          ))}
                        </span>
                      </td>
                      <td>
                        <span className={`grid-pill tone-${row.tone}`}>
                          {row.statusLabel}
                        </span>
                      </td>
                      <td>{row.next}</td>
                    </>
                  ) : (
                    <>
                      <td>{readable(row.action)}</td>
                      <td>{readable(row.outcome)}</td>
                    </>
                  )}
                  <td>
                    {row.evidence && (
                      <button
                        className="grid-inspect"
                        aria-label={`View ${row.actor} request details`}
                        onClick={() => onSelect?.(row.evidence)}
                      >
                        View
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <p className="grid-empty">No events in this run</p>}
        </div>
      )}
      <div className="grid-caption">
        <span>
          {rows.length} {race ? 'requests' : 'events'}
        </span>
        {unavailable && <span>Table view</span>}
      </div>
    </section>
  );
}
