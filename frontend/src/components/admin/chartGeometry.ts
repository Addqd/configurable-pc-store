/**
 * Geometry of the analytics line chart, shared with its loading placeholder.
 *
 * The chart keeps a 720-unit reference coordinate system and grows with its
 * container, so both the real chart and the skeleton need the same numbers.
 */

/** Approved desktop width of the chart drawing area, in reference units. */
export const CHART_BASE_WIDTH = 720

/** Below this width the drawing is rendered 1:1 instead of scaled down. */
export const CHART_MIN_WIDTH = 200

/** Height of the legend row rendered below the plot area. */
export const CHART_LEGEND_HEIGHT = 24

/**
 * Pixel scale of the drawing area.
 *
 * Wide containers keep the 720-unit reference geometry and therefore grow, which
 * is the approved desktop rendering. Containers between 200 and 720 pixels are
 * drawn 1:1 so 11px axis text stays 11px instead of shrinking with the drawing.
 */
export function chartScale(containerWidth: number): number {
  return containerWidth / Math.max(CHART_MIN_WIDTH, Math.min(CHART_BASE_WIDTH, containerWidth))
}

/** Height of the rendered chart for a given drawing-area width. */
export function lineChartHeight(height: number, containerWidth: number): number {
  return Math.round(height * chartScale(containerWidth)) + CHART_LEGEND_HEIGHT
}
