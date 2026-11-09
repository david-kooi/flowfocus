import QtQuick
import QtQuick.Controls as Controls
import qs.Commons
import qs.Commons as Theme

Controls.Menu {
  id: root
  property bool canDelete: true
  signal renameRequested()
  signal deleteRequested()
  width: Style.space(160)
  popupType: Controls.Popup.Item
  padding: Style.space(4)
  implicitHeight: menuList.contentHeight + topPadding + bottomPadding
  contentItem: ListView {
    id: menuList
    implicitWidth: Style.space(160)
    implicitHeight: contentHeight
    model: root.contentModel
    interactive: false
    clip: true
    currentIndex: root.currentIndex
  }
  background: Rectangle {
    color: Theme.Color.popups.background
    border.color: Theme.Color.popups.text
    border.width: 1
    radius: Style.cornerRadius
  }
  component Entry: Controls.MenuItem {
    id: entry
    width: menuList.width
    implicitWidth: label.implicitWidth + Style.spacing.controlPaddingX * 2
    implicitHeight: label.implicitHeight + Style.spacing.controlPaddingY * 2
    contentItem: Text {
      id: label
      text: entry.text
      textFormat: Text.PlainText
      font.family: Style.font.family
      font.pixelSize: Style.font.body
      color: Theme.Color.popups.text
      opacity: entry.enabled ? 1 : 0.5
    }
    background: Rectangle {
      color: entry.highlighted ? Style.hoverFillFor(Theme.Color.popups.text, Theme.Color.accent) : "transparent"
      radius: Style.cornerRadius
    }
  }
  Entry { text: "Rename"; onTriggered: root.renameRequested() }
  Entry { text: "Delete"; enabled: root.canDelete; onTriggered: root.deleteRequested() }
}
