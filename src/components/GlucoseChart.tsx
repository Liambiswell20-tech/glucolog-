import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { G, Line, Text as SvgText } from 'react-native-svg';
import type { GlucoseChartProps } from './types';

const CHART_PADDING = 32; // 16px each side, matches card interior
const Y_AXIS_WIDTH = 36;
const PADDING_TOP = 8;
const PADDING_BOTTOM = 8;
const PADDING_BOTTOM_WITH_TIME = 22;
const PADDING_RIGHT = 4;

function segmentColor(mmol: number): string {
  if (mmol < 3.9) return '#FF3B30';  // hypo — red
  if (mmol > 10.0) return '#FF9500'; // high — orange
  return '#30D158';                   // in range — green
}

function formatHour(epochMs: number): string {
  const d = new Date(epochMs);
  const h = d.getHours();
  const m = d.getMinutes();
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, '0')}${suffix}`;
}

export function GlucoseChart({ response, height = 120, showTimeLabels = false }: GlucoseChartProps) {
  const { width: screenWidth } = useWindowDimensions();
  const bottomPad = showTimeLabels ? PADDING_BOTTOM_WITH_TIME : PADDING_BOTTOM;
  const drawWidth = screenWidth - CHART_PADDING - Y_AXIS_WIDTH - PADDING_RIGHT;
  const drawHeight = height - PADDING_TOP - bottomPad;
  const totalSvgWidth = Y_AXIS_WIDTH + drawWidth + PADDING_RIGHT;

  const rawValues = response.readings.map(r => r.mmol);

  if (rawValues.length < 2) {
    return (
      <View style={[styles.container, { height }]}>
        <Text style={styles.noData}>Not enough data</Text>
      </View>
    );
  }

  const minVal = Math.min(...rawValues);
  const maxVal = Math.max(...rawValues);

  const yMin = Math.max(2.0, Math.floor(minVal) - 1);
  const yMax = Math.max(14.0, Math.ceil(maxVal) + 1);
  const range = yMax - yMin;

  function toY(mmol: number): number {
    // Higher glucose → smaller y (top of chart)
    return PADDING_TOP + drawHeight - ((mmol - yMin) / range) * drawHeight;
  }

  function toX(i: number): number {
    // First point at 0, last point exactly at drawWidth
    return (i / (rawValues.length - 1)) * drawWidth;
  }

  // Per-segment coloring — color by midpoint average of the two endpoints
  const segments = rawValues.slice(0, -1).map((v1, i) => {
    const v2 = rawValues[i + 1];
    return {
      x1: toX(i),   y1: toY(v1),
      x2: toX(i + 1), y2: toY(v2),
      color: segmentColor((v1 + v2) / 2),
    };
  });

  const hypoY = toY(3.9);
  const highY = toY(10.0);

  const sectionCount = 4;
  const step = range / sectionCount;
  const yLabels = Array.from({ length: sectionCount + 1 }, (_, i) => ({
    label: (yMin + i * step).toFixed(1),
    y: toY(yMin + i * step),
  }));

  return (
    <View style={[styles.container, { height }]}>
      <Svg width={totalSvgWidth} height={height}>
        {/* Y-axis labels */}
        {yLabels.map((l, i) => (
          <SvgText
            key={i}
            x={Y_AXIS_WIDTH - 4}
            y={l.y + 3}
            textAnchor="end"
            fontSize={9}
            fill="#636366"
          >
            {l.label}
          </SvgText>
        ))}

        {/* Chart drawing area, offset by Y_AXIS_WIDTH */}
        <G x={Y_AXIS_WIDTH}>
          {/* Hypo reference line — 3.9 mmol/L */}
          <Line
            x1={0} y1={hypoY} x2={drawWidth} y2={hypoY}
            stroke="#FF3B30" strokeWidth={1} strokeDasharray="4 4"
          />
          {/* High reference line — 10.0 mmol/L */}
          <Line
            x1={0} y1={highY} x2={drawWidth} y2={highY}
            stroke="#FF9500" strokeWidth={1} strokeDasharray="4 4"
          />
          {/* Glucose curve — one segment per reading pair */}
          {segments.map((seg, i) => (
            <Line
              key={i}
              x1={seg.x1} y1={seg.y1}
              x2={seg.x2} y2={seg.y2}
              stroke={seg.color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {/* X-axis time labels */}
          {showTimeLabels && (() => {
            const dates = response.readings.map(r => r.date);
            const count = Math.min(5, rawValues.length);
            const labelY = height - 4;
            const labels: { x: number; text: string }[] = [];
            for (let i = 0; i < count; i++) {
              const idx = Math.round((i / (count - 1)) * (rawValues.length - 1));
              labels.push({ x: toX(idx), text: formatHour(dates[idx]) });
            }
            return labels.map((l, i) => (
              <SvgText
                key={`t${i}`}
                x={l.x}
                y={labelY}
                textAnchor="middle"
                fontSize={9}
                fill="#636366"
              >
                {l.text}
              </SvgText>
            ));
          })()}
        </G>
      </Svg>
      {response.isPartial && (
        <Text style={styles.partialNote}>Curve still building</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderRadius: 8,
    backgroundColor: '#1C1C1E',
  },
  noData: {
    color: '#636366',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 40,
    fontStyle: 'italic',
  },
  partialNote: {
    fontSize: 11,
    color: '#FF9500',
    textAlign: 'center',
    paddingVertical: 4,
  },
});
