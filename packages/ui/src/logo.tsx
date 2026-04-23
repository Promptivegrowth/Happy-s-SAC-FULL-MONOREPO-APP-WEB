import Image from 'next/image';
import { cn } from './cn';

type Props = {
  className?: string;
  /** alto del logo en px (mantiene proporción 332x200) */
  height?: number;
  /** muestra solo el isotipo, sin tagline */
  iconOnly?: boolean;
  /** invertir colores para fondos oscuros (aplica filter brightness) */
  invert?: boolean;
  /** prioridad de carga (true en hero / login) */
  priority?: boolean;
};

/**
 * Logo oficial Happy's Disfraces.
 * El asset debe estar en /public/logo.png en cada app (332x200 transparente).
 */
export function Logo({ className, height = 36, iconOnly = false, invert = false, priority = false }: Props) {
  const width = Math.round(height * (332 / 200));
  return (
    <Image
      src="/logo.png"
      alt="Happy's Disfraces"
      width={width}
      height={height}
      priority={priority}
      className={cn('select-none object-contain', invert && 'brightness-0 invert', iconOnly && 'aspect-square object-contain', className)}
      sizes={`${width}px`}
    />
  );
}
