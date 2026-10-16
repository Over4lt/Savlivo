// Source-visible control policy. Classification has no truth authority.
export function safeRenderedControl(row,kind,selectedPeer=null) {
    if(!row||typeof row.text!=='string'||row.disabled!==false||!Array.isArray(row.bboxPx)||row.bboxPx.length!==4||row.bboxPx[2]<=0||row.bboxPx[3]<=0)return false;
    const label=[row.text,row.ariaLabel??''].join(' ').normalize('NFKC').toLowerCase();
    if(/\b(?:buy|purchase|subscribe|checkout|payment|pay now|start trial|sign in|log in|delete|cancel subscription|submit order)\b/.test(label))return false;
    if(kind==='COOKIE_REJECT')return row.role==='button'&&/\b(?:cookies?|consent|privacy)\b/.test([label,row.contextText??''].join(' ').toLowerCase())&&/\b(?:reject|decline|deny|only necessary|necessary only|essential only|continue without accepting)\b/.test(label);
    if(kind==='COOKIE_COMPLETE'){
        const name=String(row.consentDialogName??'').toLowerCase();
        const intent=String(row.ariaLabel||row.text).normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase();
        return row.role==='button'&&/\b(?:cookies?|consent|privacy|preference)\b/.test(name)&&/^(?:close(?: (?:preference|privacy|cookie|consent)(?: center| settings)?)?|done|save(?: (?:preferences|settings|choices))?|confirm(?: (?:preferences|settings|choices))?|reject all)$/.test(intent);
    }
    // Selectable role and explicit unselected state, not English billing words.
    if(kind==='PRESENTATION_SELECT'){
        if(['tab','radio'].includes(row.role))return row.selected===false;
        if(row.role!=='button'||row.selected!==false||!selectedPeer||selectedPeer.id===row.id||selectedPeer.role!=='button'||selectedPeer.selected!==true||selectedPeer.disabled!==false||!row.groupId||row.groupId!==selectedPeer.groupId||!Array.isArray(selectedPeer.bboxPx))return false;
        const peerLabel=[selectedPeer.text,selectedPeer.ariaLabel??''].join(' ').normalize('NFKC').toLowerCase();
        if(/\b(?:buy|purchase|subscribe|checkout|payment|pay now|start trial|sign in|log in|delete|cancel subscription|submit order)\b/.test(peerLabel))return false;
        const [x,y,width,height]=row.bboxPx,[peerX,peerY,peerWidth,peerHeight]=selectedPeer.bboxPx;
        return Math.abs(y-peerY)<=Math.max(height,peerHeight)&&Math.abs(x+width/2-peerX-peerWidth/2)<=600;
    }
    return false;
}
