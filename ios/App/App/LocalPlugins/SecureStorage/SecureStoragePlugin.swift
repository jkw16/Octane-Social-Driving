import Foundation
import Capacitor
import Security

/**
 * SecureStoragePlugin
 *
 * A small local Capacitor plugin that persists string values in the iOS
 * Keychain (encrypted, device-local, hardware-backed) instead of the
 * WebView's plaintext localStorage. Exposed to JS as the "SecureStorage"
 * plugin with get / set / remove methods.
 *
 * Values are stored as Keychain generic-password items scoped to a fixed
 * service tag so they don't collide with other apps or the app's own
 * credentials. Accessible after first unlock, this-device-only (not synced
 * to iCloud Keychain), encrypted at rest.
 */
@objc(SecureStoragePlugin)
public class SecureStoragePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SecureStoragePlugin"
    public let jsName = "SecureStorage"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise)
    ]

    private let service = "app.octane.securestorage"

    @objc func get(_ call: CAPPluginCall) {
        guard let key = call.options["key"] as? String else {
            call.reject("key is required")
            return
        }
        call.resolve(["value": read(key: key) ?? NSNull()])
    }

    @objc func set(_ call: CAPPluginCall) {
        guard let key = call.options["key"] as? String,
              let value = call.options["value"] as? String else {
            call.reject("key and value are required")
            return
        }
        if write(key: key, value: value) {
            call.resolve()
        } else {
            call.reject("failed to write to keychain")
        }
    }

    @objc func remove(_ call: CAPPluginCall) {
        guard let key = call.options["key"] as? String else {
            call.reject("key is required")
            return
        }
        delete(key: key)
        call.resolve()
    }

    // MARK: - Keychain helpers

    private func read(key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess,
              let data = item as? Data,
              let str = String(data: data, encoding: .utf8) else {
            return nil
        }
        return str
    }

    private func write(key: String, value: String) -> Bool {
        let data = Data(value.utf8)
        // Replace any existing item for this key.
        delete(key: key)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ]
        let status = SecItemAdd(query as CFDictionary, nil)
        return status == errSecSuccess
    }

    private func delete(key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key
        ]
        SecItemDelete(query as CFDictionary)
    }
}