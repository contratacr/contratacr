import UIKit
import Capacitor
import FirebaseCore
import FirebaseMessaging

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, MessagingDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // EL PUSH EN iPHONE NUNCA FUNCIONÓ, Y ESTA ERA LA PIEZA QUE FALTABA.
        //
        // Capacitor entrega el token de APNs tal cual lo da Apple. El servidor
        // manda por Firebase, y Firebase NO puede enviar a un token de APNs:
        // por eso `/api/push/register` lo rechazaba con un 422 y ningún
        // iPhone quedaba registrado. Android sí funcionaba porque ahí el SDK
        // de Firebase ya estaba puesto y entregaba un token FCM.
        //
        // Firebase arranca aquí y, más abajo, recibe el token de APNs para
        // canjearlo por uno de FCM. Ahí el servidor deja de rechazarlo.
        FirebaseApp.configure()
        Messaging.messaging().delegate = self
        ocultarBarraDelTeclado()
        return true
    }

    // LA FRANJA BLANCA ENCIMA DEL TECLADO.
    //
    // En cualquier campo de la app, iOS ponía sobre el teclado la barra de
    // formulario de Safari (flechas ↑ ↓ y «OK»). En una app se ve como un
    // contenedor blanco vacío pegado al teclado, sobre todo en los buscadores.
    // La vista web la toma de `inputAccessoryView` de su vista de contenido;
    // devolver nada la quita en toda la app. Es lo mismo que hace por dentro el
    // plugin de teclado de Capacitor, pero sin cambiar cómo se encoge la
    // pantalla al abrir el teclado, que la app ya tiene ajustado a mano.
    private func ocultarBarraDelTeclado() {
        guard let clase = NSClassFromString("WKContentView") else { return }
        let selector = #selector(getter: UIResponder.inputAccessoryView)
        guard let metodo = class_getInstanceMethod(clase, selector) else { return }
        let sinBarra: @convention(block) (AnyObject) -> UIView? = { _ in nil }
        method_setImplementation(metodo, imp_implementationWithBlock(sinBarra))
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        // El token de APNs va SOLO a Firebase, no a Capacitor. Antes se le
        // pasaba tal cual al plugin, el plugin se lo daba al JavaScript y el
        // JavaScript lo mandaba a `/api/push/register`, que lo rechazaba con
        // un 422 porque Firebase no puede enviar a un token de APNs.
        //
        // Con esto Firebase lo canjea, y abajo devolvemos el token FCM.
        Messaging.messaging().apnsToken = deviceToken
    }

    // El plugin de Capacitor acepta el token como texto además de como `Data`
    // (ver `didRegisterForRemoteNotificationsWithDeviceToken` en
    // PushNotificationsPlugin.swift), así que el token FCM entra por la misma
    // puerta y el JavaScript no cambia: sigue escuchando `registration`.
    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard let fcmToken else { return }
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: fcmToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
