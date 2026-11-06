import React from 'react';
import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { Dialog } from '@base-ui/react/dialog';
import { cva } from 'class-variance-authority';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Local shadcn-style components: source-owned variants over accessible Base UI primitives.
export const cn=(...inputs)=>twMerge(clsx(inputs));
const variants=cva('button',{variants:{variant:{default:'button-primary',outline:'button-outline',ghost:'button-ghost'},size:{default:'',small:'button-small'}},defaultVariants:{variant:'default',size:'default'}});
export function Button({className,variant,size,...props}) {
  return <ButtonPrimitive className={cn(variants({variant,size}),className)} {...props}/>;
}
export function Modal({open,onOpenChange,title,description,children,wide=false}) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Backdrop className="dialog-backdrop"/>
    <Dialog.Popup className={cn('dialog',wide&&'dialog-wide')}>
      <div className="dialog-heading"><Dialog.Title className="dialog-title">{title}</Dialog.Title><Dialog.Close className="dialog-close" aria-label="Close dialog">×</Dialog.Close></div>
      <Dialog.Description className="dialog-description">{description}</Dialog.Description>{children}
    </Dialog.Popup></Dialog.Portal></Dialog.Root>;
}
export function Badge({children,tone='neutral'}) {return <span className={`badge badge-${tone}`}>{children}</span>;}
