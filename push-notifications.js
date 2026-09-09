(() => {
  const APP_ID = "56e52691-81e9-4fec-84af-b74520c1d36f";
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async (OneSignal) => {
    try {
      await OneSignal.init({
        appId: APP_ID,
        serviceWorkerPath: "painel-producao/push/onesignal/OneSignalSDKWorker.js",
        serviceWorkerParam: { scope: "/painel-producao/push/onesignal/" },
        notifyButton: { enable: true },
        welcomeNotification: { disable: true },
        allowLocalhostAsSecureOrigin: false,
      });

      const session = await window.PPAuth?.getSession?.();
      if (session?.user?.id) await OneSignal.login(session.user.id);

      window.KodaPush = {
        requestPermission: () => OneSignal.Notifications.requestPermission(),
        permission: () => OneSignal.Notifications.permission,
      };
    } catch (error) {
      console.warn("KODA Push", error);
    }
  });
})();
