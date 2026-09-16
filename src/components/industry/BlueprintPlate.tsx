'use client';

import React from 'react';

interface BlueprintPlateProps {
  children: React.ReactNode;
  className?: string;
  kicker?: string;
  title?: string;
  headerRight?: React.ReactNode;
  noCorners?: boolean;
}

export const BlueprintPlate: React.FC<BlueprintPlateProps> = ({
  children,
  className = '',
  kicker,
  title,
  headerRight,
  noCorners = false,
}) => {
  return (
    <div className={`plate relative ${className}`}>
      {!noCorners && (
        <>
          <i className="corner tl" aria-hidden="true" />
          <i className="corner tr" aria-hidden="true" />
          <i className="corner bl" aria-hidden="true" />
          <i className="corner br" aria-hidden="true" />
        </>
      )}
      {(title || kicker || headerRight) && (
        <div className="plate-h">
          {kicker && <span className="kicker">{kicker}</span>}
          {title && <h6 className="font-heading font-semibold text-[11px] tracking-[0.14em] uppercase m-0">{title}</h6>}
          {headerRight && <div className="ml-auto flex items-center gap-2">{headerRight}</div>}
        </div>
      )}
      {children}
    </div>
  );
};
