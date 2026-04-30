// Web component <dotlottie-wc> registrado por
// https://unpkg.com/@lottiefiles/dotlottie-wc — declaramos su JSX
// global para poder usarlo en cualquier componente sin duplicar tipos.
declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'dotlottie-wc': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string;
          autoplay?: boolean | string;
          loop?: boolean | string;
          speed?: string | number;
        },
        HTMLElement
      >;
    }
  }
}

export {};
