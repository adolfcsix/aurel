import React from 'react';

/** The AUREL wordmark approved for the navigation and authentication surfaces. */
export const AUREL_WORDMARK_SRC = '/images/aurel-selected-wordmark.png';

export default function BrandWordmark({className = '',decorative = false}) {
 return <img
  className={['aurel-brand-wordmark',className].filter(Boolean).join(' ')}
  src={AUREL_WORDMARK_SRC}
  alt={decorative ? '' : 'AUREL'}
  aria-hidden={decorative ? 'true' : undefined}
  width="2172"
  height="724"
  decoding="async"
  draggable="false"
 />;
}
