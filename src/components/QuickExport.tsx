import { useMemo, useState } from 'react';
import { createGuidedExportDraft, deriveExportFormatCapabilities, preflightGuidedExport, type ExportIntent, type GuidedExportRunRequest, type GuidedExportCompletion } from '../core/export/guidedExport';
import type { ExportCapabilityReport } from '../lib/exportStudio';

export function QuickExport({sourceIntent,runtime,available,busy,blockers,onRun,onStill}: {
  sourceIntent: ExportIntent; runtime: ExportCapabilityReport|null; available:boolean; busy:boolean;
  blockers:readonly string[]; onRun:(request:GuidedExportRunRequest)=>Promise<GuidedExportCompletion|null>; onStill:()=>void;
}) {
  const [format,setFormat]=useState<'h264-mp4'|'png-frames'>(sourceIntent.background==='transparent'?'png-frames':'h264-mp4');
  const [silentAccepted,setSilentAccepted]=useState(false);
  const [running,setRunning]=useState(false);
  const [completion,setCompletion]=useState<GuidedExportCompletion|null>(null);
  const [error,setError]=useState<string|null>(null);
  const directory=runtime?.png.sequenceDirectory===true;
  const draft=useMemo(()=>({
    ...createGuidedExportDraft({...sourceIntent,preferredFormat:format,destinationClass:format==='png-frames'?'directory':'file'}),
    pngDestination:directory?'directory' as const:'zip' as const,
    audioConsequenceAcknowledged:silentAccepted,
    destinationSelected:true,
  }),[sourceIntent,format,directory,silentAccepted]);
  const capabilities=deriveExportFormatCapabilities({runtime,pngDestination:draft.pngDestination,exportSurfaceSupported:available,intent:draft.intent});
  const preflight=preflightGuidedExport(draft,capabilities);
  const failures=[...new Set([...blockers,...preflight.blockers.map(issue=>issue.message)])];
  const run=async()=>{
    if(running||busy||failures.length)return;
    setRunning(true);setCompletion(null);setError(null);
    try {setCompletion(await onRun({intent:draft.intent,pngDestination:draft.pngDestination,audioConsequenceAcknowledged:silentAccepted}));}
    catch(cause){setError(cause instanceof Error?cause.message:'Export failed. Your project is unchanged.');}
    finally{setRunning(false);}
  };
  return <section className="quick-export" aria-label="Export">
    <label>Format<select aria-label="Output format" value={format} disabled={busy||running} onChange={event=>{setFormat(event.target.value as typeof format);setCompletion(null);}}>
      <option value="h264-mp4">MP4 · H.264</option><option value="png-frames">PNG sequence · {directory?'folder':'ZIP'}</option>
    </select></label>
    <p className="quick-export-spec">{sourceIntent.dimensions.width} × {sourceIntent.dimensions.height} · {sourceIntent.fps.numerator} fps · {sourceIntent.finiteTimeline.frameCount} frames</p>
    {format==='png-frames'&&sourceIntent.audio.enabled?<label className="quick-export-audio"><input type="checkbox" checked={silentAccepted} onChange={event=>setSilentAccepted(event.target.checked)} disabled={busy||running}/>Export silent frames; audio remains in my project.</label>:null}
    {failures.length?<p className="quick-export-problem" role="status">{failures.join(' ')}</p>:null}
    <div className="quick-export-actions"><button type="button" disabled={busy||running||!available} onClick={onStill}>Export PNG still</button><button type="button" className="primary-action" disabled={busy||running||failures.length>0} onClick={()=>void run()}>{running?'Exporting…':'Export…'}</button></div>
    {error?<p role="alert">{error}</p>:null}
    {completion?<p role="status">{completion.artifact} · {completion.frameCount} verified frames.</p>:null}
  </section>;
}
