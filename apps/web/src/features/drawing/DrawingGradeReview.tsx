import type { DrawingSampleStats } from './drawing-sample.js';
import type { DrawingGrade } from './emnist-grader.js';

interface DrawingGradeReviewProps {
  grade: DrawingGrade;
  stats: DrawingSampleStats;
}

function SampleStats({ stats }: { stats: DrawingSampleStats }) {
  const values: Array<[string, string | number]> = [
    ['Strokes', stats.strokes],
    ['Samples', stats.samples],
    ['Time', `${(stats.durationMs / 1_000).toFixed(2)} s`],
    ['Path', stats.pathLength],
    ['Avg speed', `${stats.averageSpeed} u/s`],
    ['Peak speed', `${stats.peakSpeed} u/s`],
    ['Smoothness', `${stats.smoothness}%`],
    ['Direction', stats.directionEntropy.toFixed(2)],
    ['Coalesced', `${stats.coalesced}%`],
    ['Pressure', stats.pressure.toFixed(2)],
    ['Contact', `${stats.contactArea} px²`],
  ];
  return (
    <dl className="drawing-grade-stats">
      {values.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DrawingGradeReview({ grade, stats }: DrawingGradeReviewProps) {
  const passing = grade.isCorrect && grade.letterGrade !== 'F';
  return (
    <div className={`drawing-grade-review${passing ? ' is-good' : ' is-low'}`}>
      <div className="drawing-grade-heading">
        <span>HANDWRITING // EMNIST CNN</span>
        <strong>GRADE {grade.letterGrade}</strong>
      </div>
      <div className="drawing-grade-score">
        <b>{grade.targetLetter}</b>
        <div>
          <strong>{grade.qualityScore}%</strong>
          <span>MATCH TO “{grade.targetLetter}”</span>
        </div>
      </div>
      <div
        className="drawing-grade-meter"
        aria-label={`Match score ${grade.qualityScore}% grade ${grade.letterGrade}`}
      >
        <i style={{ width: `${grade.qualityScore}%` }} />
      </div>
      <p>MODEL READ {grade.candidates.map(({ letter }) => letter).join(' / ')}</p>
      <SampleStats stats={stats} />
    </div>
  );
}
