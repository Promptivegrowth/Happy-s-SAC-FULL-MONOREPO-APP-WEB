'use server';

import { runAction, requireUser, type ActionResult } from './_helpers';

/**
 * Notificaciones in-app (la campana del header). La tabla `notificaciones` ya
 * existía en la BD (mig 21) pero estaba sin usar. Estas acciones la activan para
 * el flujo de aprobación de OS (mig 83) y quedan disponibles para otros avisos.
 *
 * Las notificaciones se crean SIEMPRE por usuario (destinatario_usuario_id) —
 * cuando hay que avisar a "gerencia", el emisor hace fan-out a cada gerente,
 * así el estado de leído es individual.
 */

export type NotificacionUI = {
  id: string;
  tipo: string;
  titulo: string;
  mensaje: string | null;
  enlace: string | null;
  leido: boolean;
  created_at: string;
};

export async function listarMisNotificaciones(limit = 20): Promise<NotificacionUI[]> {
  const { sb, userId } = await requireUser();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sbAny = sb as unknown as { from: (t: string) => any };
  const { data } = await sbAny
    .from('notificaciones')
    .select('id, tipo, titulo, mensaje, enlace, leido, created_at')
    .eq('destinatario_usuario_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return ((data ?? []) as NotificacionUI[]);
}

export async function contarNotificacionesNoLeidas(): Promise<number> {
  const { sb, userId } = await requireUser();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sbAny = sb as unknown as { from: (t: string) => any };
  const { count } = await sbAny
    .from('notificaciones')
    .select('id', { count: 'exact', head: true })
    .eq('destinatario_usuario_id', userId)
    .eq('leido', false);
  return count ?? 0;
}

export async function marcarNotificacionLeida(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const { sb, userId } = await requireUser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };
    const { error } = await sbAny
      .from('notificaciones')
      .update({ leido: true, leido_en: new Date().toISOString() })
      .eq('id', id)
      .eq('destinatario_usuario_id', userId);
    if (error) throw new Error(error.message);
    return null;
  });
}

export async function marcarTodasNotificacionesLeidas(): Promise<ActionResult> {
  return runAction(async () => {
    const { sb, userId } = await requireUser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };
    const { error } = await sbAny
      .from('notificaciones')
      .update({ leido: true, leido_en: new Date().toISOString() })
      .eq('destinatario_usuario_id', userId)
      .eq('leido', false);
    if (error) throw new Error(error.message);
    return null;
  });
}
