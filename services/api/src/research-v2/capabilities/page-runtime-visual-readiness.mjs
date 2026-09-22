// Observes generic rendering progress only; never initiates acquisition.
export const visualQuietMs=750;
export const visualReadinessInstrumentation=`(()=>{
 const state={lastMutation:performance.now()};
 Object.defineProperty(window,'__researchVisualReadiness',{value:state});
 new MutationObserver(()=>{state.lastMutation=performance.now();}).observe(document,{subtree:true,childList:true,attributes:true,characterData:true});
})()`;
export const visualReadinessExpression=`(()=>{
 const s=window.__researchVisualReadiness;if(!s)return null;
 const d=document.documentElement,b=document.body;
 return {readyState:document.readyState,mutationAgeMs:performance.now()-s.lastMutation,
 width:Math.max(d?.scrollWidth??0,b?.scrollWidth??0),height:Math.max(d?.scrollHeight??0,b?.scrollHeight??0)};
})()`;
