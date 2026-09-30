// Deterministic research intelligence. Replaceable by an untrusted proposal model.
// There is deliberately no transport price, monetary cost or fallback gate here.
export function createReasoner({initialPerspective='AUTO'}={}) {
    if(!['AUTO','UNBOUND','COUNTRY'].includes(initialPerspective))throw Error('INVALID_INITIAL_PERSPECTIVE');
    return state=>{
        const ranked=state.actions.map(action=>{
            let value=action.kind==='DISCOVER'?20:40;
            let reason='Find a source for the remaining propositions';
            if(action.kind==='ACQUIRE') {
                const country=action.context.transport==='DECODO';
                const prior=state.observations.find(o=>o.url===action.url&&o.context.transport==='DIRECT'&&o.outcome==='OK');
                if(country) {value=60;reason='Observe the provider in the target country for these unresolved facts';}
                else reason='Inspect this grounded provider presentation for these unresolved facts';
                if(country&&prior) {value=100;reason='Direct succeeded but did not establish the remaining target facts; country observation is distinct';}
                if(state.observations.length===0&&initialPerspective==='UNBOUND'&&!country) {value=80;reason='Requested initial unbound perspective; this is not a prerequisite for country acquisition';}
                if(state.observations.length===0&&initialPerspective==='COUNTRY'&&country) {value=90;reason='Requested target-country perspective has the greatest expected information value';}
                const destination=state.destinations.find(d=>d.url===action.url);
                if(destination?.grounding.kind==='PROVIDER_LINK') {value+=15;reason+='; provider navigation grounds this destination';}
            }
            return {action,value,reason};
        }).sort((a,b)=>b.value-a.value||a.action.id.localeCompare(b.action.id));
        return ranked.length?{actionId:ranked[0].action.id,reason:ranked[0].reason}:{};
    };
}
